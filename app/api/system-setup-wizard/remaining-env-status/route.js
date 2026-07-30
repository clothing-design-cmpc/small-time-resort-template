/**
 * FILE: app/api/system-setup-wizard/remaining-env-status/route.js
 * ROLE: Wizard-session only (Step 5 of app/system-setup-wizard) — no
 *       account, no role. Gated by isSetupWizardLocked() AND
 *       hasWizardSession(), same double-gate pattern as database-status
 *       and admin-status.
 *
 * PURPOSE:
 * Reports presence-only status for the 8 envGroups.mjs groups NOT
 * already covered by Step 2 (database, supabase) or the seed-only
 * SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD keys checked by admin-status:
 *   r2, emailjs, githubActions, rateLimit, geoip, vaultSecurity,
 *   aiInsightAndDirections, siteConfig
 * Together with Step 2's two groups, this is all 10 envGroups.mjs
 * groups — nothing is ever left unchecked by the wizard.
 *
 * No live connectivity checks here (unlike services/envCheck.js's full
 * checkEnvironment(), which the admin vault dashboard uses) — several
 * of those live checks have side effects (e.g. EmailJS sends a real
 * test email) that must never fire just from loading a wizard step.
 * The Step 6 "Run Health Check" button is where live checks belong;
 * this route stays presence-only, matching Step 2's pattern.
 *
 * DATA FLOW:
 * 1. isSetupWizardLocked() -> setup already done -> reject
 * 2. hasWizardSession() -> Step 1 not passed this session -> reject
 * 3. checkEnvGroupsPresence([...REMAINING_GROUP_IDS]) -> presence-only
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isSetupWizardLocked } from "@/services/setupWizardStatus";
import { hasWizardSession } from "@/services/wizardSession";
import { checkEnvGroupsPresence } from "@/services/envCheck";

// Every envGroups.mjs group id except "database" and "supabase" —
// those two are Step 2's job (see DatabaseSetupStep.jsx).
const REMAINING_GROUP_IDS = [
  "r2",
  "emailjs",
  "githubActions",
  "rateLimit",
  "geoip",
  "vaultSecurity",
  "aiInsightAndDirections",
  "siteConfig",
];

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
    const envStatus = checkEnvGroupsPresence(REMAINING_GROUP_IDS);

    return NextResponse.json({
      success: true,
      data: { envStatus },
      message: "Environment status checked.",
    });
  } catch (error) {
    console.error("[api/system-setup-wizard/remaining-env-status] Failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't check the environment status. Please try again." },
      { status: 500 }
    );
  }
}
