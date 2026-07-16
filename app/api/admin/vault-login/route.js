/**
 * FILE: app/api/admin/vault-login/route.js
 * ROLE: Super-admin only (via requireSuperAdmin) — also covered by
 *       proxy.js since this path starts with /api/admin
 *
 * PURPOSE:
 * Second-factor login for the hidden recovery page. A valid super_admin
 * "session" cookie is required just to reach this endpoint at all, but
 * that alone is NOT enough to pass — the caller must also submit the
 * separate vault passphrase (VAULT_PASSPHRASE_HASH) before an
 * HttpOnly "vaultSession" cookie is set. Without that second cookie,
 * both the recovery page itself and GET/PATCH /api/admin/breach refuse
 * to serve anything (see services/vaultAuth.js's requireVaultSession()).
 *
 * DATA FLOW:
 * 1. POST { passphrase } from app/system-vault-x9f2/login/VaultLoginClient.jsx
 * 2. requireSuperAdmin() confirms the regular admin session is valid
 * 3. Rate limit: 5 attempts / 15 min per IP, same ceiling as the main
 *    login route — this endpoint gates disaster recovery, brute force
 *    here is just as serious as brute forcing the main password
 * 4. verifyVaultPassphrase() does a constant-time compare against
 *    VAULT_PASSPHRASE_HASH
 * 5. On match: set "vaultSession" cookie, log vault_login_success,
 *    return success. On mismatch: log vault_login_failed, return the
 *    same generic 401 either way (never reveal which check failed)
 *
 * DELETE clears the "vaultSession" cookie only — lets a super-admin
 * explicitly "lock" the vault again without ending their whole
 * super-admin session (called by RecoveryClient's "Lock Vault" button).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/services/adminSession";
import {
  verifyVaultPassphrase,
  buildVaultSessionCookieValue,
  VAULT_SESSION_COOKIE_MAX_AGE_SECONDS,
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
  // First factor: must already be a signed-in super-admin. This route
  // is a SECOND gate on top of that session, never a replacement for it.
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const { allowed } = checkRateLimit(`vault-login:${ip}`, VAULT_LOGIN_ATTEMPT_MAX, VAULT_LOGIN_ATTEMPT_WINDOW_MS);
  if (!allowed) {
    await logSecurityEvent({
      eventType: "vault_login_failed",
      actor: session.uid,
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

  const isCorrectPassphrase = verifyVaultPassphrase(payload.passphrase);

  if (!isCorrectPassphrase) {
    await logSecurityEvent({
      eventType: "vault_login_failed",
      actor: session.uid,
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
    actor: session.uid,
    request,
    details: "Vault passphrase accepted — recovery page unlocked.",
  });

  const response = NextResponse.json({
    success: true,
    data: null,
    message: "Vault unlocked.",
  });

  response.cookies.set("vaultSession", buildVaultSessionCookieValue(session.uid), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: VAULT_SESSION_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}

export async function DELETE(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

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
