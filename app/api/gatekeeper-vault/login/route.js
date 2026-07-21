/**
 * FILE: app/api/gatekeeper-vault/login/route.js
 * ROLE: Standalone — no super_admin "session" cookie required or
 *       checked. Not under /api/admin or /api/superAdmin, so proxy.js's
 *       blanket super_admin gate never touches this route.
 *
 * PURPOSE:
 * The Gatekeeper Vault's own (and only) login factor. Anyone who knows
 * the hidden URL and this passphrase gets in — separate secret from
 * services/vaultAuth.js's disaster-recovery vault.
 *
 * DATA FLOW:
 * 1. POST { passphrase } from
 *    app/gatekeeper-vault/[gatekeeperSlug]/login/GatekeeperVaultLoginClient.jsx
 * 2. Rate limit: 5 attempts / 15 min per IP (Rule 32.1 priority ceiling)
 * 3. verifyGatekeeperVaultPassphrase() does a constant-time compare
 * 4. On match: set "gatekeeperVaultSession" cookie, log
 *    gatekeeper_vault_login_success, return success. On mismatch: log
 *    gatekeeper_vault_login_failed, return the same generic 401 either way
 *
 * DELETE clears the "gatekeeperVaultSession" cookie only.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  verifyGatekeeperVaultPassphrase,
  buildGatekeeperVaultSessionCookieValue,
  GATEKEEPER_VAULT_IDENTITY,
} from "@/services/gatekeeperVaultAuth";
import { logSecurityEvent } from "@/services/securityLog";
import { checkRateLimit } from "@/services/rateLimit";

const isProduction = process.env.NODE_ENV === "production";

const GATEKEEPER_VAULT_LOGIN_ATTEMPT_MAX = 5;
const GATEKEEPER_VAULT_LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const gatekeeperVaultLoginRequestSchema = z.object({
  passphrase: z.string().min(1, "Enter the passphrase."),
});

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const { allowed } = await checkRateLimit(
    `gatekeeper-vault-login:${ip}`,
    GATEKEEPER_VAULT_LOGIN_ATTEMPT_MAX,
    GATEKEEPER_VAULT_LOGIN_ATTEMPT_WINDOW_MS
  );
  if (!allowed) {
    await logSecurityEvent({
      eventType: "gatekeeper_vault_login_failed",
      actor: GATEKEEPER_VAULT_IDENTITY,
      request,
      details: `Exceeded ${GATEKEEPER_VAULT_LOGIN_ATTEMPT_MAX} attempts within 15 minutes.`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Too many attempts. Please try again in 15 minutes." },
      { status: 429 }
    );
  }

  let payload;
  try {
    payload = gatekeeperVaultLoginRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Enter the passphrase." },
      { status: 400 }
    );
  }

  const isCorrectPassphrase = await verifyGatekeeperVaultPassphrase(payload.passphrase);

  if (!isCorrectPassphrase) {
    await logSecurityEvent({
      eventType: "gatekeeper_vault_login_failed",
      actor: GATEKEEPER_VAULT_IDENTITY,
      request,
      details: "Incorrect passphrase.",
    });
    return NextResponse.json(
      { success: false, data: null, message: "Incorrect passphrase." },
      { status: 401 }
    );
  }

  await logSecurityEvent({
    eventType: "gatekeeper_vault_login_success",
    actor: GATEKEEPER_VAULT_IDENTITY,
    request,
    details: "Passphrase accepted — Gatekeeper Vault unlocked.",
  });

  const response = NextResponse.json({
    success: true,
    data: null,
    message: "Unlocked.",
  });

  response.cookies.set("gatekeeperVaultSession", buildGatekeeperVaultSessionCookieValue(GATEKEEPER_VAULT_IDENTITY), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    // No maxAge/expires — true browser-session cookie, same reasoning
    // as services/vaultAuth.js's own "vaultSession". The 30-minute
    // ceiling is still enforced server-side regardless.
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({
    success: true,
    data: null,
    message: "Locked.",
  });

  response.cookies.set("gatekeeperVaultSession", "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
