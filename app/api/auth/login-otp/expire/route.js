/**
 * FILE: app/api/auth/login-otp/expire/route.js
 * ROLE: Public endpoint — called only by app/superAdmin/login/page.jsx's
 *       OTP form, when its own 3-minute countdown (built from the
 *       expiresAt the login route returned) reaches zero with no code
 *       ever submitted.
 *
 * PURPOSE:
 * Silence is never treated as approval. If nobody enters the code in
 * time, this is the route that actually marks the challenge expired
 * and fires Gatekeeper 3 — see services/loginAnomalyOtp.js's
 * expireLoginAnomalyChallenge(), which double-checks server-side that
 * the window has genuinely passed before doing anything (never trusts
 * the client's clock alone).
 *
 * A verify attempt that lands first (correct or incorrect) already
 * resolves the row, so a duplicate/late expire call here is always a
 * safe no-op (shouldTriggerBreach: false) — see that function's own
 * comment for why.
 *
 * DATA FLOW:
 * 1. Client POSTs { challengeId } once its local countdown hits zero
 * 2. expireLoginAnomalyChallenge() re-checks expiresAt against the DB
 *    row (not the client's clock) before marking it expired
 * 3. On shouldTriggerBreach: true, fires the same Gatekeeper 3 response
 *    the login route would have fired directly before this feature
 *    existed, using the challenge row's own stored ipAddress/
 *    anomalyReason/skipIpBlock.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { expireLoginAnomalyChallenge } from "@/services/loginAnomalyOtp";
import { logSecurityEvent } from "@/services/securityLog";
import { checkRateLimit } from "@/services/rateLimit";
import { triggerGatekeeperBreach } from "@/services/breachResponse";

// Generous limit — this fires at most once per genuine timed-out login
// attempt, but rate-limited anyway since it's a public, unauthenticated
// endpoint like every other route in this chain.
const EXPIRE_ATTEMPT_MAX = 20;
const EXPIRE_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const expireRequestSchema = z.object({
  challengeId: z.string().min(1, "Missing challenge id."),
});

function getIp(request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request) {
  const ip = getIp(request);

  const { allowed } = await checkRateLimit(`login-otp-expire:${ip}`, EXPIRE_ATTEMPT_MAX, EXPIRE_ATTEMPT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, data: null, message: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  let payload;
  try {
    payload = expireRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Missing challenge id." },
      { status: 400 }
    );
  }

  const result = await expireLoginAnomalyChallenge(payload.challengeId);

  if (result.shouldTriggerBreach && result.challenge) {
    await logSecurityEvent({
      eventType: "admin_login_denied",
      actor: result.challenge.email,
      request,
      details: "Login OTP challenge expired with no response — firing Gatekeeper 3.",
    });

    await triggerGatekeeperBreach({
      gatekeeper: 3,
      ipAddress: result.challenge.ipAddress ?? ip,
      details: result.challenge.anomalyReason || "Anomalous login OTP challenge expired unanswered.",
      skipIpBlock: result.challenge.skipIpBlock,
    }).catch((error) => console.error("[login-otp/expire] Gatekeeper 3 breach response failed:", error.message));
  }

  // Always a plain ack — the login page already knows to show the
  // "locked down" state locally once it calls this, regardless of what
  // comes back.
  const ackResponse = NextResponse.json({ success: true, data: null, message: "Challenge closed." });
  // Challenge is dead either way (expired, or was already resolved by
  // a verify call that landed first) — clear it so a stale cookie
  // can't point the /otp page at a resolved row.
  ackResponse.cookies.set("loginOtpChallenge", "", { path: "/", maxAge: 0 });
  return ackResponse;
}
