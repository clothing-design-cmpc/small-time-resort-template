/**
 * FILE: app/api/system-setup-wizard/confirm-admin/route.js
 * ROLE: Wizard-session only (Step 4 of app/system-setup-wizard) — no
 *       account, no role. Gated by isSetupWizardLocked() AND
 *       hasWizardSession(), same double-gate pattern as verify-key.
 *
 * PURPOSE:
 * Called exactly once by AdminSetupStep.jsx, the moment it first sees
 * ownerExists: true from admin-status. This route re-verifies that
 * server-side (never trusts the client's claim) and, only then, logs
 * the one-time setup_admin_created security event — the same pattern
 * database-status/route.js's 3b sub-step uses (a manual confirmation
 * step, because there's nothing else to gate the log write on
 * server-side without adding a redundant "confirmed" DB flag).
 *
 * DATA FLOW:
 * 1. isSetupWizardLocked() -> setup already done -> reject
 * 2. hasWizardSession() -> Step 1 not passed this session -> reject
 * 3. Re-check AdminProfile.count({ isOwner: true }) > 0 for real —
 *    reject with a clear message if the seed hasn't actually run yet
 * 4. logSecurityEvent({ eventType: "setup_admin_created" })
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isSetupWizardLocked } from "@/services/setupWizardStatus";
import { hasWizardSession } from "@/services/wizardSession";
import { logSecurityEvent } from "@/services/securityLog";
import { prisma } from "@/services/prisma";

export async function POST(request) {
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
    // Never trust the client's claim that the seed ran — re-derive it
    // from the database directly, the same way admin-status does.
    const ownerAdminCount = await prisma.adminProfile.count({ where: { isOwner: true } });

    if (ownerAdminCount === 0) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: "No owner admin found yet. Run `npx prisma db seed` first, then try again.",
        },
        { status: 409 }
      );
    }

    await logSecurityEvent({
      eventType: "setup_admin_created",
      actor: process.env.SEED_ADMIN_EMAIL ?? null,
      request,
      details: "Setup wizard: owner super-admin account confirmed via npx prisma db seed.",
    });

    return NextResponse.json({
      success: true,
      data: null,
      message: "Super-admin account confirmed.",
    });
  } catch (error) {
    console.error("[api/system-setup-wizard/confirm-admin] Failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't confirm the admin account. Please try again." },
      { status: 500 }
    );
  }
}
