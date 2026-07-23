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
 * 2. PATCH — the owner submits { code } from their inbox. On match,
 *    the cookie is re-issued with otpVerified: true
 *    (services/vaultAuth.js's reissueVaultSessionCookieValue) and the
 *    recovery page's server-side check now passes.
 * 3. Both log to SecurityLog (vault_otp_sent / vault_otp_verified /
 *    vault_otp_failed) with actor: VAULT_IDENTITY, same as vault-login.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVaultSession, reissueVaultSessionCookieValue, VAULT_IDENTITY } from "@/services/vaultAuth";
import { generateAndSendVaultOtp, verifyVaultOtp } from "@/services/vaultOtp";
import { logSecurityEvent } from "@/services/securityLog";
import { checkRateLimit } from "@/services/rateLimit";
import { blockIp } from "@/services/ipBlock";

const isProduction = process.env.NODE_ENV === "production";

// Sends: capped low — each send emails the owner, no reason to allow
// more than a handful of resends within a window.
const OTP_SEND_MAX = 3;
const OTP_SEND_WINDOW_MS = 15 * 60 * 1000;

// Verifies: same ceiling as vault-login's passphrase attempts (Rule
// 32.1's priority-endpoint spirit) — this is the second half of the
// same disaster-recovery gate.
const OTP_VERIFY_MAX = 5;
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

    // Same direct blockIp() pattern as vault-login's own rate-limit
    // branch — the owner's very next request to /system-vault/* is
    // caught by proxy.js's vault-slug guess guard and bounced to
    // /access-denied before the page even renders.
    if (ip !== "unknown") {
      await blockIp(ip, reason, null).catch((error) =>
        console.error("[vault-otp] blockIp failed (send):", error.message)
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

    // Same direct blockIp() pattern as vault-login's own rate-limit
    // branch — the owner's very next request to /system-vault/* is
    // caught by proxy.js's vault-slug guess guard and bounced to
    // /access-denied before the page even renders.
    if (ip !== "unknown") {
      await blockIp(ip, reason, null).catch((error) =>
        console.error("[vault-otp] blockIp failed (verify):", error.message)
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
    await logSecurityEvent({
      eventType: "vault_otp_failed",
      actor: VAULT_IDENTITY,
      request,
      // reason is internal detail for the log only — the response
      // below stays generic, mirroring vault-login's posture.
      details: reason ?? "Incorrect or expired code.",
    });
    return NextResponse.json(
      { success: false, data: null, message: "Incorrect or expired code." },
      { status: 401 }
    );
  }

  await logSecurityEvent({
    eventType: "vault_otp_verified",
    actor: VAULT_IDENTITY,
    request,
    details: "Vault OTP verified — recovery dashboard unlocked.",
  });

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
