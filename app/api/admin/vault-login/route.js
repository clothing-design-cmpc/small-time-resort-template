/**
 * FILE: app/api/admin/vault-login/route.js
 * ROLE: Standalone — no super_admin "session" cookie required. Excluded
 *       from proxy.js's blanket /api/admin gate (see
 *       VAULT_STANDALONE_API_PATHS in proxy.js).
 *
 * PURPOSE:
 * First factor of the vault's own login chain. This used to also
 * require an existing super_admin session before the passphrase was
 * even checked — that coupling is gone. Anyone who knows the hidden
 * vault URL and the passphrase gets this far; the second factor
 * (email OTP, services/vaultOtp.js) is what actually gates the
 * recovery dashboard itself.
 *
 * DATA FLOW:
 * 1. POST { passphrase } from app/system-vault/[vaultSlug]/login/VaultLoginClient.jsx
 * 2. Rate limit: 5 attempts / 15 min per IP, same ceiling as the main
 *    login route — this endpoint gates disaster recovery, brute force
 *    here is just as serious as brute forcing the main password
 * 3. verifyVaultPassphrase() does a constant-time compare against
 *    Vault.passphraseHash (DB), falling back to
 *    VAULT_PASSPHRASE_HASH (.env.local) if no DB value has ever been
 *    set yet — see services/vaultAuth.js for why the DB is the source
 *    of truth once auto-rotation (services/breachResponse.js) runs
 * 4. On match: set "vaultSession" cookie (uid: VAULT_IDENTITY), log
 *    vault_login_success, return success. On mismatch: log
 *    vault_login_failed, return the same generic 401 either way
 *
 * DELETE clears the "vaultSession" cookie only — lets whoever is on
 * the recovery page explicitly "lock" the vault again.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  verifyVaultPassphrase,
  buildVaultSessionCookieValue,
  VAULT_IDENTITY,
} from "@/services/vaultAuth";
import { logSecurityEvent } from "@/services/securityLog";
import { checkRateLimit } from "@/services/rateLimit";

const isProduction = process.env.NODE_ENV === "production";

// Same priority-endpoint ceiling as the main login route (Rule 32.1) —
// this passphrase gates disaster recovery, not a lower-stakes action.
const VAULT_LOGIN_ATTEMPT_MAX = 5;
const VAULT_LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const vaultLoginRequestSchema = z.object({
  passphrase: z.string().min(1, "Enter the vault passphrase."),
});

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const { allowed } = await checkRateLimit(`vault-login:${ip}`, VAULT_LOGIN_ATTEMPT_MAX, VAULT_LOGIN_ATTEMPT_WINDOW_MS);
  if (!allowed) {
    await logSecurityEvent({
      eventType: "vault_login_failed",
      actor: VAULT_IDENTITY,
      request,
      details: `Exceeded ${VAULT_LOGIN_ATTEMPT_MAX} vault passphrase attempts within 15 minutes.`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Too many attempts. Please try again in 15 minutes." },
      { status: 429 }
    );
  }

  let payload;
  try {
    payload = vaultLoginRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Enter the vault passphrase." },
      { status: 400 }
    );
  }

  const isCorrectPassphrase = await verifyVaultPassphrase(payload.passphrase);

  if (!isCorrectPassphrase) {
    await logSecurityEvent({
      eventType: "vault_login_failed",
      actor: VAULT_IDENTITY,
      request,
      details: "Incorrect vault passphrase.",
    });
    return NextResponse.json(
      { success: false, data: null, message: "Incorrect passphrase." },
      { status: 401 }
    );
  }

  await logSecurityEvent({
    eventType: "vault_login_success",
    actor: VAULT_IDENTITY,
    request,
    details: "Vault passphrase accepted — recovery page unlocked.",
  });

  const response = NextResponse.json({
    success: true,
    data: null,
    message: "Vault unlocked.",
  });

  response.cookies.set("vaultSession", buildVaultSessionCookieValue(VAULT_IDENTITY), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    // Deliberately NO maxAge/expires — this must be a true browser-
    // session cookie, cleared the instant the browser fully quits.
    // With maxAge set, the cookie survived on disk and stayed valid
    // for up to VAULT_SESSION_COOKIE_MAX_AGE_SECONDS even after the
    // browser was closed and reopened — the opposite of what a
    // disaster-recovery gate should do. The 30-minute ceiling is still
    // enforced, just server-side now: verifyVaultSession() below
    // checks the cookie's own embedded issuedAt against
    // VAULT_SESSION_COOKIE_MAX_AGE_SECONDS on every request, so a
    // browser that's kept open (cookie never expires from the
    // browser's point of view) still gets logged out after 30 minutes
    // regardless.
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({
    success: true,
    data: null,
    message: "Vault locked.",
  });

  response.cookies.set("vaultSession", "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
