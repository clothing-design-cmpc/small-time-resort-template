/**
 * FILE: app/api/admin/vault-wipe/confirm/route.js
 * ROLE: Vault-session only (requireVaultSession, otpVerified)
 *
 * PURPOSE:
 * Handles the "Continue" button on VaultWipeGraceModal.jsx, the vault
 * recovery page's own final-warning modal — mirrors
 * app/api/superAdmin/wipe/confirm/route.js exactly, so a wipe
 * scheduled through the vault still reaches its 2-hour final
 * checkpoint even if nobody visits the regular super-admin panel.
 * "Don't continue" reuses DELETE /api/admin/vault-wipe instead of
 * duplicating that logic here.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireVaultSession } from "@/services/vaultAuth";
import { confirmWipeContinue } from "@/services/databaseWipeRequest";
import { logSecurityEvent } from "@/services/securityLog";

export async function PATCH(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  let result;
  try {
    result = await confirmWipeContinue();
  } catch (error) {
    console.error("[api/admin/vault-wipe/confirm PATCH] confirmWipeContinue failed:", error);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to confirm the wipe. Please try again.", error: error.message },
      { status: 500 }
    );
  }

  await logSecurityEvent({
    eventType: "admin_action",
    actor: vaultSession.uid,
    request,
    details: result.success
      ? 'Confirmed "Continue" on the vault wipe final warning — wipe will proceed as scheduled.'
      : "Attempted to confirm a vault-scheduled database wipe but none was pending.",
  });

  if (!result.success) {
    return NextResponse.json({ success: false, data: null, message: result.message }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: result.data, message: "Confirmed. The wipe will proceed as scheduled." });
}
