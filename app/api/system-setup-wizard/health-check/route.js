/**
 * FILE: app/api/system-setup-wizard/health-check/route.js
 * ROLE: Wizard-session only (Step 6 of app/system-setup-wizard) — no
 *       account, no role. Gated by isSetupWizardLocked() AND
 *       hasWizardSession(), same double-gate pattern as every other
 *       route under app/api/system-setup-wizard/.
 *
 * PURPOSE:
 * Thin wrapper around the existing runSystemHealthCheck() (same
 * function the vault dashboard's "Run System Health Check" button
 * already calls via app/api/admin/system-health) — reused here rather
 * than duplicated. Confirms database connectivity, core table
 * reachability (bookings, rooms, system_settings), and scans for
 * double-booking conflicts. Never mutates anything — safe to run as
 * often as the wizard session wants.
 *
 * DATA FLOW:
 * 1. isSetupWizardLocked() -> setup already done -> reject
 * 2. hasWizardSession() -> Step 1 not passed this session -> reject
 * 3. runSystemHealthCheck() -> connectivity + core tables + conflicts
 * 4. logSecurityEvent({ eventType: "setup_health_check_run" }) — fire
 *    every run, same reasoning as env-check/route.js
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isSetupWizardLocked } from "@/services/setupWizardStatus";
import { hasWizardSession } from "@/services/wizardSession";
import { logSecurityEvent } from "@/services/securityLog";
import { runSystemHealthCheck } from "@/services/systemHealthCheck";

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
    const result = await runSystemHealthCheck();

    await logSecurityEvent({
      eventType: "setup_health_check_run",
      actor: null,
      request,
      details: `Setup wizard: system health check run — overall status ${result.overallStatus}.`,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: "System health check completed.",
    });
  } catch (error) {
    console.error("[api/system-setup-wizard/health-check] Failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't run the health check. Please try again." },
      { status: 500 }
    );
  }
}
