/**
 * FILE: app/api/system-setup-wizard/env-check/route.js
 * ROLE: Wizard-session only (Step 6 of app/system-setup-wizard) — no
 *       account, no role. Gated by isSetupWizardLocked() AND
 *       hasWizardSession(), same double-gate pattern as every other
 *       route under app/api/system-setup-wizard/.
 *
 * PURPOSE:
 * Thin wrapper around the existing checkEnvironment() (same function
 * the vault dashboard's "Run Environment Check" button already calls
 * via app/api/admin/env-check) — reused here rather than duplicated,
 * same reasoning as remaining-env-status/route.js reusing
 * checkEnvGroupsPresence(). Runs all 11 envGroups.mjs groups' presence
 * PLUS the four live checks (database, GeoIP file, Google Drive OAuth,
 * EmailJS test send).
 *
 * The EmailJS live check sends one real email to VAULT_OWNER_EMAIL —
 * acceptable here for the same reason it's acceptable on the vault
 * dashboard (services/envCheck.js's own header comment): this route
 * only ever runs when the person on this wizard session clicks "Run
 * Env Check," never automatically or on mount.
 *
 * DATA FLOW:
 * 1. isSetupWizardLocked() -> setup already done -> reject
 * 2. hasWizardSession() -> Step 1 not passed this session -> reject
 * 3. checkEnvironment() -> full group + live-check report
 * 4. logSecurityEvent({ eventType: "setup_env_check_run" }) — fire
 *    every run, not just once (unlike setup_admin_created, this is a
 *    repeatable diagnostic action, not a one-time milestone)
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isSetupWizardLocked } from "@/services/setupWizardStatus";
import { hasWizardSession } from "@/services/wizardSession";
import { logSecurityEvent } from "@/services/securityLog";
import { checkEnvironment } from "@/services/envCheck";

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
    const result = await checkEnvironment();

    await logSecurityEvent({
      eventType: "setup_env_check_run",
      actor: null,
      request,
      details: `Setup wizard: environment check run — overall status ${result.overallStatus}.`,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: "Environment check completed.",
    });
  } catch (error) {
    console.error("[api/system-setup-wizard/env-check] Failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't run the environment check. Please try again." },
      { status: 500 }
    );
  }
}
