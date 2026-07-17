/**
 * FILE: app/api/admin/blocked-ips/request-unban-code/route.js
 * ROLE: Vault-session only (requireVaultSession, otpVerified) — excluded
 *       from proxy.js's blanket /api/admin super_admin gate via
 *       VAULT_STANDALONE_API_PATHS.
 *
 * PURPOSE:
 * Step-up re-verification, first half. A valid vault session alone
 * (passphrase + the original login OTP) is not enough to unban an IP —
 * unbanning reopens a door that a gatekeeper just closed. Clicking
 * "Unban" on any row calls this route, which always forces a BRAND
 * NEW code (forceNew: true) and emails it to VAULT_OWNER_EMAIL,
 * exactly like the vault's own login OTP step. The owner then enters
 * that fresh code in UnbanIpModal.jsx, checked by
 * app/api/admin/blocked-ips/unban/route.js — never by this route.
 *
 * Deliberately reuses services/vaultOtp.js's existing
 * generateAndSendVaultOtp()/verifyVaultOtp() pair rather than adding a
 * second OTP system: the vault only ever has one owner, and by the
 * time this route can even be called the owner has already completed
 * the full login OTP chain, so there is no concurrent-login code to
 * collide with.
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

  const result = await generateAndSendVaultOtp(true);

  if (!result.success) {
    return NextResponse.json({ success: false, data: null, message: result.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: { expiresAt: result.expiresAt },
    message: result.message,
  });
}
