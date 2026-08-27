/**
 * FILE: app/api/auth/login-otp/verify/route.js
 * ROLE: Public endpoint — called only by app/superAdmin/login/page.jsx's
 *       OTP form, right after app/api/auth/login/route.js responds
 *       with { otpRequired: true, challengeId }.
 *
 * PURPOSE:
 * Second half of the Gatekeeper 3 pre-lockdown OTP challenge (see
 * services/loginAnomalyOtp.js and the login route's own file header).
 * A correct code finishes the login exactly the way the normal login
 * route would have (session cookie + AdminSession row, via
 * services/loginSession.js) — Gatekeeper 3 never fires. A wrong code,
 * exhausted attempts, or an already-expired challenge all fire the
 * same full breach response app/api/auth/login/route.js used to fire
 * immediately, before this feature existed.
 *
 * DATA FLOW:
 * 1. Client POSTs { challengeId, code }
 * 2. Rate-limited + SQL-injection-scanned the same way every other
 *    code-entry endpoint in this app is (vault-otp, vault-login).
 * 3. services/loginAnomalyOtp.js's verifyLoginAnomalyChallenge() does
 *    the actual constant-time comparison — this handler never sees or
 *    compares the code itself.
 * 4. On verified: true, rebuild the session cookie from the challenge
 *    row's stored authUserId/role/fullName and attach it, same shape
 *    the normal login route returns.
 * 5. On shouldTriggerBreach: true, call triggerGatekeeperBreach with
 *    the challenge row's own stored ipAddress/anomalyReason/skipIpBlock
 *    — identical inputs to what the login route would have passed
 *    directly, before this feature existed.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyLoginAnomalyChallenge } from "@/services/loginAnomalyOtp";
import { buildSessionPayload, attachSessionCookie, persistAdminSession } from "@/services/loginSession";
import { logSecurityEvent } from "@/services/securityLog";
import { checkRateLimit } from "@/services/rateLimit";
import { scanForSqlInjection } from "@/services/sqlInjectionGuard";
import { triggerGatekeeperBreach } from "@/services/breachResponse";

const isProduction = process.env.NODE_ENV === "production";

// Same priority-endpoint tier as the main login route (Rule 32.1) —
// this endpoint gates the exact same outcome (a super-admin session),
// so it needs the same protection against being hammered directly.
const VERIFY_ATTEMPT_MAX = 5;
const VERIFY_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const verifyRequestSchema = z.object({
  challengeId: z.string().min(1, "Missing challenge id."),
  code: z.string().min(1, "Enter the code from the owner's email."),
});

function getIp(request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request) {
  const ip = getIp(request);

  const { allowed } = await checkRateLimit(`login-otp-verify:${ip}`, VERIFY_ATTEMPT_MAX, VERIFY_ATTEMPT_WINDOW_MS);
  if (!allowed) {
    const reason = `Exceeded ${VERIFY_ATTEMPT_MAX} login OTP verify attempts within 15 minutes.`;
    await logSecurityEvent({ eventType: "rate_limit_hit", actor: null, request, details: reason });

    // GATEKEEPER 1 TRIPPED — hammering this endpoint directly is the
    // same brute-force signal as hammering /api/auth/login itself.
    if (ip !== "unknown") {
      await triggerGatekeeperBreach({ gatekeeper: 1, ipAddress: ip, details: reason }).catch((error) =>
        console.error("[login-otp/verify] Gatekeeper 1 breach response failed:", error.message)
      );
    }

    return NextResponse.json(
      { success: false, data: null, message: "Too many attempts. Please try again in 15 minutes." },
      { status: 429 }
    );
  }

  let payload;
  try {
    payload = verifyRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Enter the code from the owner's email." },
      { status: 400 }
    );
  }

  // Defense-in-depth detection layer, same pattern as every other
  // code-entry endpoint in this app (vault-otp, vault-login, login).
  const sqliHit = scanForSqlInjection(payload);
  if (sqliHit) {
    await logSecurityEvent({
      eventType: "sql_injection_attempt",
      actor: null,
      request,
      details: `Suspicious pattern detected in field "${sqliHit}" on login OTP verification.`,
    });

    if (ip !== "unknown") {
      await triggerGatekeeperBreach({
        gatekeeper: 2,
        ipAddress: ip,
        details: `SQL injection pattern detected in field "${sqliHit}" on login OTP verification.`,
      }).catch((error) => console.error("[login-otp/verify] Gatekeeper 2 breach response failed:", error.message));
    }

    return NextResponse.json(
      { success: false, data: null, message: "Enter the code from the owner's email." },
      { status: 400 }
    );
  }

  const result = await verifyLoginAnomalyChallenge(payload.challengeId, payload.code);

  if (result.verified) {
    const { sessionId, sessionPayload } = buildSessionPayload({
      authUserId: result.challenge.authUserId,
      role: result.challenge.role,
    });

    await logSecurityEvent({
      eventType: "login_success",
      actor: result.challenge.email,
      request,
      details: `${result.challenge.fullName} signed in (OTP-confirmed anomalous login).`,
    });

    const response = NextResponse.json({
      success: true,
      data: { fullName: result.challenge.fullName, role: result.challenge.role },
      message: "Signed in successfully.",
    });

    attachSessionCookie(response, sessionPayload, isProduction);
    await persistAdminSession({ sessionId, authUserId: result.challenge.authUserId, ipAddress: ip });

    // Challenge is resolved — no reason for this cookie to outlive it.
    response.cookies.set("loginOtpChallenge", "", { path: "/", maxAge: 0 });

    return response;
  }

  if (result.shouldTriggerBreach && result.challenge) {
    await logSecurityEvent({
      eventType: "admin_login_denied",
      actor: result.challenge.email,
      request,
      details: `Login OTP challenge failed (${result.reason}) — firing Gatekeeper 3.`,
    });

    await triggerGatekeeperBreach({
      gatekeeper: 3,
      ipAddress: result.challenge.ipAddress ?? ip,
      details: result.challenge.anomalyReason || "Anomalous login OTP challenge failed.",
      skipIpBlock: result.challenge.skipIpBlock,
    }).catch((error) => console.error("[login-otp/verify] Gatekeeper 3 breach response failed:", error.message));

    const breachResponse = NextResponse.json(
      { success: false, data: null, message: "Incorrect or expired code. This attempt has been reported." },
      { status: 403 }
    );
    // Challenge is dead either way — clear it so a stale cookie can't
    // point the /otp page at a resolved row.
    breachResponse.cookies.set("loginOtpChallenge", "", { path: "/", maxAge: 0 });
    return breachResponse;
  }

  // No pending challenge (already resolved, wrong id, etc.) — never
  // reveal which case this was, same "no extra hints" posture as
  // vault-login/vault-otp.
  return NextResponse.json(
    { success: false, data: null, message: "Incorrect or expired code." },
    { status: 400 }
  );
}
