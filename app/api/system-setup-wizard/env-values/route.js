/**
 * FILE: app/api/system-setup-wizard/env-values/route.js
 * ROLE: Wizard-session only (Step 5 of app/system-setup-wizard) — no
 *       account, no role. Gated by isSetupWizardLocked() AND
 *       hasWizardSession(), same double-gate pattern as
 *       remaining-env-status and database-status.
 *
 * PURPOSE:
 * Unlike services/envCheck.js's checkEnvGroupsPresence() (deliberately
 * presence-only, never returns a value), this route DOES return the
 * actual current value of every ENV_GROUPS key read off this server's
 * own process.env — so ScriptsHealthStep.jsx's two "Download …
 * Reference (.txt)" buttons can pre-fill KEY=value instead of leaving
 * every line blank. This is safe specifically because of where it's
 * used: the wizard is local-machine-only setup tooling, gated behind
 * the same WIZARD_SETUP_KEY session as every other wizard route, and
 * permanently 404s the moment SystemSettings.setupFinalized is set
 * (isSetupWizardLocked()) — it can never be reached on a finished,
 * handed-off production site.
 *
 * Only returns values already loaded into THIS running process — same
 * "Node reads .env.local once at startup" limitation every other
 * wizard step already documents (RemainingEnvStep.jsx's hint text,
 * etc.). A key added to .env.local after the dev server last started
 * still reports missing here until the server is restarted.
 *
 * DATA FLOW:
 * 1. isSetupWizardLocked() -> setup already done -> reject
 * 2. hasWizardSession() -> Step 1 not passed this session -> reject
 * 3. Walk every ENV_GROUPS key -> { value, present } off process.env
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isSetupWizardLocked } from "@/services/setupWizardStatus";
import { hasWizardSession } from "@/services/wizardSession";
import { ENV_GROUPS } from "@/scripts/lib/envGroups.mjs";

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
    // Flat { KEY: { value, present } } map across every group/key in
    // envGroups.mjs — the two reference builders on the client pick
    // out the subset each one needs (full list for Vercel, a
    // hand-curated subset for GitHub Actions).
    const values = {};
    for (const group of ENV_GROUPS) {
      for (const { key } of group.keys) {
        const raw = process.env[key];
        const present = typeof raw === "string" && raw.trim().length > 0;
        values[key] = { value: present ? raw : "", present };
      }
    }

    return NextResponse.json({
      success: true,
      data: { values },
      message: "Environment values read.",
    });
  } catch (error) {
    console.error("[api/system-setup-wizard/env-values] Failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't read the environment values. Please try again." },
      { status: 500 }
    );
  }
}
