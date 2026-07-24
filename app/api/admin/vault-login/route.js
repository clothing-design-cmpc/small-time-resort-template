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
 *    (GATEKEEPER 1 — see the rate-limit and wrong-passphrase branches below)
 * 3. scanForSqlInjection() checks the passphrase field before it's ever
 *    compared — same defense-in-depth VISIBILITY layer the main login
 *    route uses (GATEKEEPER 2). Prisma/bcrypt already make real
 *    injection structurally impossible here; this is purely detection.
 * 4. verifyVaultPassphrase() does a constant-time compare against
 *    Vault.passphraseHash (DB), falling back to
 *    VAULT_PASSPHRASE_HASH (.env.local) if no DB value has ever been
 *    set yet — see services/vaultAuth.js for why the DB is the source
 *    of truth once auto-rotation (services/breachResponse.js) runs
 * 5. On match: set "vaultSession" cookie (uid: VAULT_IDENTITY), log
 *    vault_login_success, return success. On mismatch: log
 *    vault_login_failed, return the same generic 401 either way.
 *    (GATEKEEPER 3 — anomalous-login detection — deliberately does NOT
 *    run here; passphrase-only is just the 1st factor. It runs on the
 *    OTP verification step instead — see app/api/admin/vault-otp/route.js)
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
import { triggerGatekeeperBreach } from "@/services/breachResponse";
import { scanForSqlInjection } from "@/services/sqlInjectionGuard";

const isProduction = process.env.NODE_ENV === "production";

// Zero-tolerance: any single wrong guess is treated exactly like
// exceeding the window (see the immediate breach trigger below) — this
// value is kept at 1 rather than removed so the fallback branch still
// reads correctly for concurrent/racing requests hitting the same IP.
const VAULT_LOGIN_ATTEMPT_MAX = 1;
const VAULT_LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const vaultLoginRequestSchema = z.object({
  passphrase: z.string().min(1, "Enter the vault passphrase."),
});

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const { allowed } = await checkRateLimit(`vault-login:${ip}`, VAULT_LOGIN_ATTEMPT_MAX, VAULT_LOGIN_ATTEMPT_WINDOW_MS);
  if (!allowed) {
    const reason = `Exceeded ${VAULT_LOGIN_ATTEMPT_MAX} vault passphrase attempts within 15 minutes.`;
    await logSecurityEvent({
      eventType: "vault_login_failed",
      actor: VAULT_IDENTITY,
      request,
      details: reason,
    });

    // GATEKEEPER 1 TRIPPED — same treatment as brute-forcing the main
    // login route (app/api/auth/login/route.js): this is disaster
    // recovery's own front door, and brute-forcing it is exactly as
    // serious. triggerGatekeeperBreach() blocks the IP (step 1) AND
    // rotates + emails + Drive-backs-up a fresh passphrase (step 6) —
    // previously this branch only called blockIp() directly, so a
    // brute-force attempt against the passphrase itself never actually
    // invalidated the passphrase being attacked. Once blocked, the
    // owner's very next request to /system-vault/* is caught by
    // proxy.js's vault-slug guess guard and bounced to /access-denied
    // before the page even renders — the client below reloads to land
    // on exactly that check.
    if (ip !== "unknown") {
      await triggerGatekeeperBreach({ gatekeeper: 1, ipAddress: ip, details: reason }).catch((error) =>
        console.error("[vault-login] Gatekeeper 1 breach response failed:", error.message)
      );
    }

    return NextResponse.json(
      { success: false, data: null, blocked: true, message: "Too many attempts. Please try again in 15 minutes." },
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

  // Defense-in-depth detection layer (Prisma/bcrypt already make real
  // SQL injection structurally impossible here — this just logs the
  // attempt). Same pattern as app/api/auth/login/route.js.
  const sqliHit = scanForSqlInjection(payload);
  if (sqliHit) {
    const reason = `Suspicious pattern detected in field "${sqliHit}" on vault login.`;
    await logSecurityEvent({
      eventType: "sql_injection_attempt",
      actor: VAULT_IDENTITY,
      request,
      details: reason,
    });

    // GATEKEEPER 2 TRIPPED — an actual attack pattern reached the
    // vault's own front door. This is a stronger signal than the rate
    // limiter (Gatekeeper 1) since it means the payload itself, not
    // just the volume, looked malicious.
    if (ip !== "unknown") {
      await triggerGatekeeperBreach({ gatekeeper: 2, ipAddress: ip, details: reason }).catch((error) =>
        console.error("[vault-login] Gatekeeper 2 breach response failed:", error.message)
      );
    }

    return NextResponse.json(
      { success: false, data: null, message: "Incorrect passphrase." },
      { status: 400 }
    );
  }

  const isCorrectPassphrase = await verifyVaultPassphrase(payload.passphrase.trim());

  if (!isCorrectPassphrase) {
    const reason = "Incorrect vault passphrase — zero-tolerance gate, any wrong guess trips Gatekeeper 1 immediately.";
    await logSecurityEvent({
      eventType: "vault_login_failed",
      actor: VAULT_IDENTITY,
      request,
      details: reason,
    });

    // GATEKEEPER 1 TRIPPED — zero tolerance: this is disaster recovery's
    // own front door, so a single wrong guess is treated exactly like
    // exceeding the rate limit above (full breach response: block IP,
    // rotate + email + Drive-back-up a fresh passphrase). The owner's
    // very next request under /system-vault/* is caught by proxy.js's
    // vault-slug guess guard and bounced to /access-denied — the client
    // below reloads on blocked: true to land on exactly that check.
    if (ip !== "unknown") {
      await triggerGatekeeperBreach({ gatekeeper: 1, ipAddress: ip, details: reason }).catch((error) =>
        console.error("[vault-login] Gatekeeper 1 breach response failed:", error.message)
      );
    }

    return NextResponse.json(
      { success: false, data: null, blocked: true, message: "Incorrect passphrase." },
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
