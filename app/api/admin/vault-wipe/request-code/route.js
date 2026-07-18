/**
 * FILE: app/api/admin/vault-wipe/request-code/route.js
 * ROLE: Vault-session only (requireVaultSession, otpVerified) — excluded
 *       from proxy.js's blanket /api/admin super_admin gate via
 *       VAULT_STANDALONE_API_PATHS.
 *
 * PURPOSE:
 * Step-up re-verification, first half, for the vault's own Danger
 * Zone (VaultDangerZoneSection.jsx). A valid vault session alone is
 * not enough to schedule or instantly run a database wipe — that is
 * the single most destructive action in the app, so it gets the same
 * fresh-emailed-code treatment as unbanning an IP
 * (blocked-ips/request-unban-code/route.js), reusing the same
 * services/vaultOtp.js pair rather than adding a second OTP system.
 *
 * Accepts an optional { forceNew: boolean } body, same shape and same
 * reason as app/api/admin/vault-otp/route.js's POST: the step-up
 * modal's automatic on-mount call sends forceNew: false so a
 * still-valid code from a moment ago isn't silently invalidated and
 * re-emailed — fixes React StrictMode's dev-only double-effect-fire
 * sending two separate codes (and two emails) for one modal open.
 *
 * DATA FLOW:
 * 1. Opening either the "Schedule wipe" or "Truncate Now" step-up
 *    modal calls this route, which emails a code to VAULT_OWNER_EMAIL
 * 2. The owner enters that fresh code, which is checked by
 *    app/api/admin/vault-wipe/route.js (POST) or
 *    app/api/admin/vault-wipe/truncate-now/route.js — never here
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireVaultSession } from "@/services/vaultAuth";
import { generateAndSendVaultOtp } from "@/services/vaultOtp";

export async function POST(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  // Body is optional — a request with no body (or invalid JSON) keeps
  // the safe default (forceNew: true).
  let forceNew = true;
  try {
    const body = await request.json();
    if (typeof body?.forceNew === "boolean") forceNew = body.forceNew;
  } catch {
    // No body sent — keep the default.
  }

  const result = await generateAndSendVaultOtp(forceNew);

  if (!result.success) {
    return NextResponse.json({ success: false, data: null, message: result.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: { expiresAt: result.expiresAt },
    message: result.message,
  });
}
