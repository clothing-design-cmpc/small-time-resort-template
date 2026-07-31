/**
 * FILE: app/api/system-setup-wizard/finalize-setup/route.js
 * ROLE: Wizard-session only (Step 11 of app/system-setup-wizard) —
 *       called once by SetupCompleteStep.jsx's "Finished testing —
 *       lock the wizard" button.
 *
 * PURPOSE:
 * Sets SystemSettings.setupFinalized, which is what actually flips
 * isSetupWizardLocked() (services/setupWizardStatus.js) to true from
 * here on. Before this click, the wizard page and every API route
 * under it stay open even after the owner AdminProfile and
 * VaultPassphrase both exist — this route is the deliberate moment
 * the developer says "done testing" and the whole system locks:
 *   - /system-setup-wizard -> 404 on next load
 *   - every /api/system-setup-wizard/* route -> rejects
 *   - scripts/postinstallSetup.mjs stops reopening the setup guide
 *
 * DATA FLOW:
 * 1. hasWizardSession() -> Step 1 not passed this session -> reject
 * 2. arePrerequisitesMet() must be TRUE (owner admin + vault
 *    passphrase both real) -> finalizing before either exists makes
 *    no sense -> reject if prerequisites aren't met yet. Deliberately
 *    NOT isSetupWizardLocked() here — that would be circular, since
 *    locked now depends on the very flag this route sets.
 * 3. SystemSettings.upsert({ setupFinalized: true, setupFinalizedAt: now })
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { arePrerequisitesMet } from "@/services/setupWizardStatus";
import { hasWizardSession } from "@/services/wizardSession";
import { prisma } from "@/services/prisma";

export async function POST(request) {
  if (!hasWizardSession(request)) {
    return NextResponse.json(
      { success: false, data: null, message: "Setup key required." },
      { status: 401 }
    );
  }

  // Confirm the owner admin and vault passphrase are actually real
  // before allowing the wizard to be locked — finalizing an
  // incomplete setup would lock everyone out with no way back in.
  if (!(await arePrerequisitesMet())) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: "Finish the super-admin account and vault passphrase steps before finalizing.",
      },
      { status: 400 }
    );
  }

  try {
    await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: { setupFinalized: true, setupFinalizedAt: new Date() },
      create: { id: "singleton", setupFinalized: true, setupFinalizedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      data: null,
      message: "Setup finalized. The wizard and setup guide are now locked.",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, data: null, message: "Couldn't save that. Please try again.", error: error.message },
      { status: 500 }
    );
  }
}
