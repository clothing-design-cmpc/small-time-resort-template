/**
 * FILE: app/api/system-setup-wizard/dismiss-guide/route.js
 * ROLE: Wizard-session only (Step 11 of app/system-setup-wizard) —
 *       called once by SetupCompleteStep.jsx's "Finished testing —
 *       stop showing the setup guide" button.
 *
 * PURPOSE:
 * Sets SystemSettings.setupGuideDismissed so scripts/postinstallSetup.mjs
 * (via scripts/lib/wizardLockCheck.mjs) stops reopening scripts/setup-guide.html
 * on future `npm install` / `npm run dev` runs. This is a SEPARATE
 * signal from isSetupWizardLocked() — that check already goes true a
 * few steps before this one (owner AdminProfile + VaultPassphrase set),
 * so the guide would have stopped reopening on its own regardless.
 * This route exists only because the developer asked for an explicit,
 * deliberate confirmation instead of relying solely on the derived state.
 *
 * DATA FLOW:
 * 1. hasWizardSession() -> Step 1 not passed this session -> reject
 * 2. isSetupWizardLocked() must be TRUE (opposite of every earlier
 *    wizard route) -> dismissing before setup is actually finished
 *    makes no sense -> reject if setup isn't done yet
 * 3. SystemSettings.upsert({ setupGuideDismissed: true, setupGuideDismissedAt: now })
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isSetupWizardLocked } from "@/services/setupWizardStatus";
import { hasWizardSession } from "@/services/wizardSession";
import { prisma } from "@/services/prisma";

export async function POST(request) {
  if (!hasWizardSession(request)) {
    return NextResponse.json(
      { success: false, data: null, message: "Setup key required." },
      { status: 401 }
    );
  }

  // Unlike every earlier wizard route, we WANT isSetupWizardLocked() to
  // be true here — dismissing the guide only makes sense once setup is
  // actually finished (owner admin + vault passphrase both set).
  if (!(await isSetupWizardLocked())) {
    return NextResponse.json(
      { success: false, data: null, message: "Finish setup before dismissing the guide." },
      { status: 400 }
    );
  }

  try {
    await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: { setupGuideDismissed: true, setupGuideDismissedAt: new Date() },
      create: { id: "singleton", setupGuideDismissed: true, setupGuideDismissedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      data: null,
      message: "Setup guide will no longer open automatically.",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, data: null, message: "Couldn't save that. Please try again.", error: error.message },
      { status: 500 }
    );
  }
}
