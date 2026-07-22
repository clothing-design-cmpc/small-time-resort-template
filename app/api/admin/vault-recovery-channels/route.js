/**
 * FILE: app/api/admin/vault-recovery-channels/route.js
 * ROLE: Vault-session only (requireVaultSession) — excluded from
 *       proxy.js's blanket /api/admin super_admin gate via
 *       VAULT_STANDALONE_API_PATHS. Never checks requireSuperAdmin()
 *       and never accepts a regular admin session, unlike the old
 *       super-admin settings page this replaces — a client's daily
 *       admin login can never reach this route, only someone who has
 *       actually solved the vault's own passphrase + OTP chain can.
 *
 * PURPOSE:
 * POST -> runs services/recoveryChannelTester.js's four dry-run checks
 * (GitHub token validity, Drive refresh-token validity, EmailJS config
 * presence, and the optional secondary-webhook test alert) and returns
 * per-channel pass/fail/skipped results. Never rotates the passphrase,
 * never uploads a real backup file, never dispatches a workflow, and
 * never sends a real EmailJS email — see that file's header for
 * exactly what each check does.
 *
 * Always logged as an admin_action (actor: the vaultSession's uid, the
 * same identity every other Danger Zone action already logs under),
 * so a pattern of repeated failures shows up in the vault's own
 * Activity Log too, not just in this one-off response.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireVaultSession } from "@/services/vaultAuth";
import { logSecurityEvent } from "@/services/securityLog";
import { runRecoveryChannelTests } from "@/services/recoveryChannelTester";

export async function POST(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  try {
    const result = await runRecoveryChannelTests();

    await logSecurityEvent({
      eventType: "admin_action",
      actor: vaultSession.uid,
      request,
      details: `Ran Test Recovery Channels from the vault — ${result.passedCount}/${result.totalCount} required channels passed.`,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: result.allPassed
        ? `All ${result.totalCount} required recovery channels are working.`
        : `${result.passedCount}/${result.totalCount} required recovery channels are working — see details below.`,
    });
  } catch (error) {
    console.error("[vault-recovery-channels] Failed to run checks:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't run the recovery channel tests. Please try again.", error: error.message },
      { status: 500 }
    );
  }
}
