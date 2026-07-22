/**
 * FILE: app/api/admin/rotate-vault-url/route.js
 * ROLE: Vault-session only (requireVaultSession, otpVerified) —
 *       excluded from proxy.js's blanket /api/admin super_admin gate
 *       via VAULT_STANDALONE_API_PATHS, same as vault-wipe and
 *       env-check. Never checks requireSuperAdmin().
 *
 * PURPOSE:
 * Task 5 — "Rotating vault slug", independent of the passphrase.
 * Today the recovery URL only ever changes as a side effect of
 * rotateVaultPassphrase() (see services/vaultAuth.js's
 * computeVaultUrlSlug() header comment). This route lets the owner
 * force a NEW URL on its own — for the case where the link itself may
 * have leaked (shared over an insecure channel, sitting in a proxy or
 * browser history log) but the passphrase is still believed safe —
 * without burning a good passphrase or emailing everyone a brand-new
 * one they'd have to re-memorize.
 *
 * No step-up code required (unlike vault-wipe's POST): this action
 * can't destroy or expose any data on its own, and the immediate
 * confirmation modal already guards against an accidental click.
 *
 * DATA FLOW:
 * 1. Owner clicks "Rotate Recovery URL" in VaultDangerZoneSection.jsx,
 *    confirms the modal
 * 2. POST here -> requireVaultSession() -> rotateVaultUrlSalt() ->
 *    new slug is live immediately, current slug 404s from this point on
 * 3. sendVaultUrlRotationEmail() sends the new URL to VAULT_OWNER_EMAIL
 *    (best-effort — a failed email never blocks the rotation itself)
 * 4. SecurityLog row recorded (Rule 6/38) regardless of email outcome
 * 5. Response includes the new full URL AND just its path, so the
 *    client can redirect there immediately instead of the owner being
 *    stranded on a slug that no longer resolves
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireVaultSession, rotateVaultUrlSalt, getVaultRecoveryPath } from "@/services/vaultAuth";
import { sendVaultUrlRotationEmail } from "@/services/emailAlert";
import { logSecurityEvent } from "@/services/securityLog";

export async function POST(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  try {
    const newVaultRecoveryUrl = await rotateVaultUrlSalt();
    const newVaultRecoveryPath = await getVaultRecoveryPath();

    const emailSent = await sendVaultUrlRotationEmail(newVaultRecoveryUrl);

    await logSecurityEvent({
      eventType: "admin_action",
      actor: vaultSession.uid,
      request,
      details: `Recovery URL rotated (passphrase unchanged). Notification email ${
        emailSent ? "sent" : "failed to send — check VAULT_OWNER_EMAIL / EmailJS config"
      }.`,
    });

    return NextResponse.json({
      success: true,
      data: { newVaultRecoveryUrl, newVaultRecoveryPath, emailSent },
      message: emailSent
        ? "Recovery URL rotated. The new link was emailed to the vault owner."
        : "Recovery URL rotated, but the notification email failed to send — copy the new link now.",
    });
  } catch (error) {
    console.error("[api/admin/rotate-vault-url] Failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't rotate the recovery URL. Please try again." },
      { status: 500 }
    );
  }
}
