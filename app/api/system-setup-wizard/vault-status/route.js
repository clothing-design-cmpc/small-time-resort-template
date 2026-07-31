/**
 * FILE: app/api/system-setup-wizard/vault-status/route.js
 * ROLE: Wizard-session only (Step 7 of app/system-setup-wizard) — no
 *       account, no role. Gated by isSetupWizardLocked() AND
 *       hasWizardSession(), same double-gate pattern as every other
 *       route under app/api/system-setup-wizard/.
 *
 * PURPOSE:
 * Strictly read-only. Returns the current hidden-recovery-page URL
 * (services/vaultAuth.js's getVaultRecoveryUrl()) so
 * VerifyVaultAccessStep.jsx (Step 7) has a real, clickable link —
 * without generating or changing anything. Replaces the old
 * dependency on generate-passphrase's response for this value, now
 * that the vault passphrase is set via scripts/hashVaultPassphrase.js
 * (terminal-only) instead of a web auto-generate call — Step 7 has
 * nothing to receive as a prop anymore, so it fetches this itself.
 *
 * Returns vaultUrl: null (never an error) if no passphrase has been
 * set yet (neither DB row nor VAULT_PASSPHRASE_HASH env var) — the
 * component shows its own "couldn't be computed" message for that
 * case, same as before.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isSetupWizardLocked } from "@/services/setupWizardStatus";
import { hasWizardSession } from "@/services/wizardSession";
import { getVaultRecoveryPath, getVaultRecoveryUrl } from "@/services/vaultAuth";

export async function GET(request) {
  if (await isSetupWizardLocked()) {
    return NextResponse.json(
      { success: false, data: null, message: "Setup has already been completed." },
      { status: 404 }
    );
  }

  if (!hasWizardSession(request)) {
    return NextResponse.json(
      { success: false, data: null, message: "Setup key required." },
      { status: 401 }
    );
  }

  try {
    // getVaultRecoveryPath() returns null when no passphrase hash is
    // configured yet (neither DB row nor env fallback) — check that
    // first, since getVaultRecoveryUrl() itself always returns a
    // string (a "not-configured-yet" placeholder path when unset).
    const path = await getVaultRecoveryPath();
    const vaultUrl = path ? await getVaultRecoveryUrl() : null;
    return NextResponse.json({ success: true, data: { vaultUrl }, message: "Vault status fetched." });
  } catch (error) {
    console.error("[api/system-setup-wizard/vault-status] Failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't check the vault status. Please try again." },
      { status: 500 }
    );
  }
}
