/**
 * FILE: app/api/admin/vault-otp/route.js
 * ROLE: Standalone — same as app/api/admin/vault-login/route.js, this
 *       is excluded from proxy.js's blanket /api/admin gate (see
 *       VAULT_STANDALONE_API_PATHS in proxy.js). Never trusts the
 *       regular super_admin "session" cookie.
 *
 * PURPOSE:
 * Second factor of the vault's own login chain. Both handlers below
 * require an existing "vaultSession" cookie (i.e. the passphrase from
 * vault-login already succeeded) before doing anything — this route
 * can't be used to skip the passphrase step, only to complete it.
 *
 * DATA FLOW:
 * 1. POST — the vault OTP screen (VaultOtpClient.jsx) calls this once
 *    on mount. Requires a vaultSession cookie with otpVerified: false.
 *    Generates + emails a fresh code via services/vaultOtp.js.
 * 2. PATCH — the owner submits { code } from their inbox.
 *    scanForSqlInjection() checks the code field first (GATEKEEPER 2 —
 *    same detection-only pattern as vault-login and the main login
 *    route). On a correct code: the cookie is re-issued with
 *    otpVerified: true (services/vaultAuth.js's
 *    reissueVaultSessionCookieValue) and the recovery page's
 *    server-side check now passes. The returned SecurityLog row is
 *    then checked for isAnomalous (GATEKEEPER 3 — impossible travel or
 *    a brand-new device relative to prior vault unlocks); this is the
 *    step that fires GK3, not vault-login, since passphrase-only isn't
 *    a completed authentication yet — see services/securityLog.js's
 *    ANOMALY_ELIGIBLE_EVENT_TYPES.
 * 3. Both log to SecurityLog (vault_otp_sent / vault_otp_verified /
 *    vault_otp_failed / sql_injection_attempt) with actor:
 *    VAULT_IDENTITY, same as vault-login. GATEKEEPER 1 (rate limit +
 *    zero-tolerance wrong code) already covered every branch below
 *    before this change.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVaultSession, reissueVaultSessionCookieValue, VAULT_IDENTITY } from "@/services/vaultAuth";
import { generateAndSendVaultOtp, verifyVaultOtp } from "@/services/vaultOtp";
import { logSecurityEvent } from "@/services/securityLog";
import { checkRateLimit } from "@/services/rateLimit";
import { triggerGatekeeperBreach } from "@/services/breachResponse";
import { scanForSqlInjection } from "@/services/sqlInjectionGuard";

const isProduction = process.env.NODE_ENV === "production";

// Sends: capped low — each send emails the owner, no reason to allow
// more than a handful of resends within a window.
const OTP_SEND_MAX = 3;
const OTP_SEND_WINDOW_MS = 15 * 60 * 1000;

// Zero-tolerance: any single wrong/expired code is treated exactly like
// exceeding the window (see the immediate breach trigger below) — kept
// at 1 rather than removed so the fallback branch still reads correctly
// for concurrent/racing requests hitting the same IP.
const OTP_VERIFY_MAX = 1;
const OTP_VERIFY_WINDOW_MS = 15 * 60 * 1000;

const otpVerifyRequestSchema = z.object({
  code: z.string().min(1, "Enter the code from your email."),
});

function getIp(request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * POST
 * Requires an existing (passphrase-verified) vaultSession cookie.
 * Generates and emails a fresh 12-character code — unless the caller
 * passes { forceNew: false } (VaultOtpClient's automatic on-mount send)
 * AND a still-valid code is already outstanding, in which case the
 * existing code is left alone (see generateAndSendVaultOtp's forceNew
 * doc). Never reveals whether the caller was missing a session vs.
 * rate-limited beyond the standard 401/429 status codes — same "no
 * extra hints" posture as vault-login.
 */
export async function POST(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession) {
    return NextResponse.json(
      { success: false, data: null, message: "Enter the vault passphrase first." },
      { status: 401 }
    );
  }

  const ip = getIp(request);
  const { allowed } = await checkRateLimit(`vault-otp-send:${ip}`, OTP_SEND_MAX, OTP_SEND_WINDOW_MS);
  if (!allowed) {
    const reason = `Exceeded ${OTP_SEND_MAX} vault OTP send requests within 15 minutes.`;
    await logSecurityEvent({
      eventType: "vault_otp_failed",
      actor: VAULT_IDENTITY,
      request,
      details: reason,
    });

    // GATEKEEPER 1 TRIPPED — same full breach response as vault-login's
    // own rate-limit branch (blocks the IP AND rotates + emails +
    // Drive-backs-up a fresh passphrase). The owner's very next request
    // to /system-vault/* is caught by proxy.js's vault-slug guess guard
    // and bounced to /access-denied before the page even renders.
    if (ip !== "unknown") {
      await triggerGatekeeperBreach({ gatekeeper: 1, ipAddress: ip, details: reason }).catch((error) =>
        console.error("[vault-otp] Gatekeeper 1 breach response failed (send):", error.message)
      );
    }

    return NextResponse.json(
      { success: false, data: null, blocked: true, message: "Too many code requests. Please wait a few minutes." },
      { status: 429 }
    );
  }

  // Body is optional — a request with no body (or invalid JSON) is
  // treated as forceNew: true, so nothing here can accidentally suppress
  // a legitimate send if the client ever fails to include it.
  let forceNew = true;
  try {
    const body = await request.json();
    if (typeof body?.forceNew === "boolean") forceNew = body.forceNew;
  } catch {
    // No body sent — keep the safe default (forceNew: true).
  }

  let result;
  try {
    result = await generateAndSendVaultOtp(forceNew);
  } catch (error) {
    // Most likely cause: the vault table doesn't exist yet because
    // `npx prisma db push` hasn't been run against this database. Log
    // the real error server-side (visible in the terminal running
    // `npm run dev`) but never leak it to the client.
    console.error("[api/admin/vault-otp] POST failed unexpectedly:", error.message);
    await logSecurityEvent({
      eventType: "vault_otp_failed",
      actor: VAULT_IDENTITY,
      request,
      details: `Vault OTP send threw: ${error.message}`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Failed to send the verification email. Please try again." },
      { status: 500 }
    );
  }

  await logSecurityEvent({
    eventType: result.success ? "vault_otp_sent" : "vault_otp_failed",
    actor: VAULT_IDENTITY,
    request,
    details: result.success
      ? result.skipped
        ? "Vault OTP send skipped — a still-valid code was already outstanding."
        : "Vault OTP emailed to owner."
      : `Vault OTP send failed: ${result.message}`,
  });

  return NextResponse.json(
    {
      success: result.success,
      data: result.success ? { skipped: Boolean(result.skipped), expiresAt: result.expiresAt } : null,
      message: result.message,
    },
    { status: result.success ? 200 : 500 }
  );
}

/**
 * PATCH
 * Requires an existing vaultSession cookie AND the correct code.
 * verifyVaultOtp() does the actual (constant-time, server-side)
 * comparison — this handler never sees or compares the code itself,
 * it only interprets the result and, on success, re-issues the cookie.
 */
export async function PATCH(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession) {
    return NextResponse.json(
      { success: false, data: null, message: "Enter the vault passphrase first." },
      { status: 401 }
    );
  }

  const ip = getIp(request);
  const { allowed } = await checkRateLimit(`vault-otp-verify:${ip}`, OTP_VERIFY_MAX, OTP_VERIFY_WINDOW_MS);
  if (!allowed) {
    const reason = `Exceeded ${OTP_VERIFY_MAX} vault OTP attempts within 15 minutes.`;
    await logSecurityEvent({
      eventType: "vault_otp_failed",
      actor: VAULT_IDENTITY,
      request,
      details: reason,
    });

    // GATEKEEPER 1 TRIPPED — same full breach response as vault-login's
    // own rate-limit branch (blocks the IP AND rotates + emails +
    // Drive-backs-up a fresh passphrase). The owner's very next request
    // to /system-vault/* is caught by proxy.js's vault-slug guess guard
    // and bounced to /access-denied before the page even renders.
    if (ip !== "unknown") {
      await triggerGatekeeperBreach({ gatekeeper: 1, ipAddress: ip, details: reason }).catch((error) =>
        console.error("[vault-otp] Gatekeeper 1 breach response failed (verify):", error.message)
      );
    }

    return NextResponse.json(
      { success: false, data: null, blocked: true, message: "Too many attempts. Please try again in 15 minutes." },
      { status: 429 }
    );
  }

  let payload;
  try {
    payload = otpVerifyRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Enter the code from your email." },
      { status: 400 }
    );
  }

  // Defense-in-depth detection layer (Prisma already makes real SQL
  // injection structurally impossible here — this just logs the
  // attempt). Same pattern as vault-login and the main login route.
  const sqliHit = scanForSqlInjection(payload);
  if (sqliHit) {
    const detectionReason = `Suspicious pattern detected in field "${sqliHit}" on vault OTP verification.`;
    await logSecurityEvent({
      eventType: "sql_injection_attempt",
      actor: VAULT_IDENTITY,
      request,
      details: detectionReason,
    });

    // GATEKEEPER 2 TRIPPED — an actual attack pattern reached the
    // vault's second factor. Stronger signal than the rate limiter
    // (Gatekeeper 1) since the payload itself looked malicious.
    if (ip !== "unknown") {
      await triggerGatekeeperBreach({ gatekeeper: 2, ipAddress: ip, details: detectionReason }).catch((error) =>
        console.error("[vault-otp] Gatekeeper 2 breach response failed:", error.message)
      );
    }

    return NextResponse.json(
      { success: false, data: null, message: "Incorrect or expired code." },
      { status: 400 }
    );
  }

  let verified, reason;
  try {
    ({ verified, reason } = await verifyVaultOtp(payload.code));
  } catch (error) {
    console.error("[api/admin/vault-otp] PATCH failed unexpectedly:", error.message);
    await logSecurityEvent({
      eventType: "vault_otp_failed",
      actor: VAULT_IDENTITY,
      request,
      details: `Vault OTP verify threw: ${error.message}`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }

  if (!verified) {
    const failReason = reason ?? "Incorrect or expired code.";
    await logSecurityEvent({
      eventType: "vault_otp_failed",
      actor: VAULT_IDENTITY,
      request,
      // reason is internal detail for the log only — the response
      // below stays generic, mirroring vault-login's posture.
      details: failReason,
    });

    // GATEKEEPER 1 TRIPPED — zero tolerance, same posture as
    // vault-login's passphrase check: a single wrong or expired code is
    // treated exactly like exceeding the rate limit above (full breach
    // response: block IP, rotate + email + Drive-back-up a fresh
    // passphrase). The owner's very next request under /system-vault/*
    // is caught by proxy.js's vault-slug guess guard and bounced to
    // /access-denied — the client below reloads on blocked: true to
    // land on exactly that check.
    if (ip !== "unknown") {
      await triggerGatekeeperBreach({ gatekeeper: 1, ipAddress: ip, details: `Vault OTP: ${failReason}` }).catch((error) =>
        console.error("[vault-otp] Gatekeeper 1 breach response failed (verify):", error.message)
      );
    }

    return NextResponse.json(
      { success: false, data: null, blocked: true, message: "Incorrect or expired code." },
      { status: 401 }
    );
  }

  const securityLogRow = await logSecurityEvent({
    eventType: "vault_otp_verified",
    actor: VAULT_IDENTITY,
    request,
    details: "Vault OTP verified — recovery dashboard unlocked.",
  });

  // GATEKEEPER 3 TRIPPED — a genuinely correct passphrase AND OTP, but
  // the built-in anomaly detector (services/securityLog.js) flagged
  // this as impossible travel or a brand-new device relative to the
  // vault's own prior unlocks. This is the most serious of the three
  // signals: it means someone already has both correct factors. Fire
  // the full breach response even though everything checked out —
  // this is exactly the "assume the worst, rotate the passphrase"
  // scenario the vault exists to protect against.
  //
  // NOTE: actor is the shared VAULT_IDENTITY constant, not a per-person
  // email — every legitimate vault user is compared against the same
  // device/location history. A team with multiple people sharing
  // vault access from genuinely different locations/devices will see
  // more false positives here than the main per-admin login route
  // does; that's an accepted tradeoff for a disaster-recovery gate
  // where over-reacting (an unnecessary passphrase rotation + email)
  // is far cheaper than under-reacting.
  if (securityLogRow?.isAnomalous && ip !== "unknown") {
    await triggerGatekeeperBreach({
      gatekeeper: 3,
      ipAddress: ip,
      details: securityLogRow.anomalyReason || "Anomalous vault unlock detected.",
    }).catch((error) => console.error("[vault-otp] Gatekeeper 3 breach response failed:", error.message));
  }

  const response = NextResponse.json({
    success: true,
    data: null,
    message: "Verified.",
  });

  response.cookies.set("vaultSession", reissueVaultSessionCookieValue(vaultSession), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    // No maxAge — see app/api/admin/vault-login/route.js's POST handler
    // for why this must be a true browser-session cookie. Server-side
    // 30-minute expiry (decodeVaultSessionCookieValue in
    // services/vaultAuth.js) is unaffected — it's driven by the
    // grantedAt this re-issue deliberately preserves, not by this
    // cookie option.
  });

  return response;
}
