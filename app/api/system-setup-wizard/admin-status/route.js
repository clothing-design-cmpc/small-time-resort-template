/**
 * FILE: app/api/system-setup-wizard/admin-status/route.js
 * ROLE: Wizard-session only (Step 4 of app/system-setup-wizard) — no
 *       account, no role. Gated by isSetupWizardLocked() AND
 *       hasWizardSession(), same double-gate pattern as database-status.
 *
 * PURPOSE:
 * Reports real, DB-derived status for Step 4 (Create Super-Admin):
 *   - seedEmailSet     : SEED_ADMIN_EMAIL present in the environment
 *   - seedPasswordSet  : SEED_ADMIN_PASSWORD present in the environment
 *   - ownerExists      : AdminProfile.count({ isOwner: true }) > 0
 * No custom "create admin" form exists here on purpose — the project's
 * `npx prisma db seed` (prisma/seed.js) already does this idempotently,
 * reading SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD. This route only ever
 * confirms that command succeeded; it never creates anything itself.
 *
 * WHY SEED_ADMIN_EMAIL/PASSWORD AREN'T CHECKED VIA envGroups.mjs:
 * They're single-use bootstrap credentials for one seed run, not a
 * standing service integration — they don't belong in the 11
 * envGroups.mjs groups Steps 2/5 walk through. Presence is checked
 * directly here instead, same presence-only rule (true/false, never
 * the value itself, even though these are just email/password rather
 * than API secrets).
 *
 * DATA FLOW:
 * 1. isSetupWizardLocked() -> setup already done -> reject
 * 2. hasWizardSession() -> Step 1 not passed this session -> reject
 * 3. Presence-only check on SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 * 4. AdminProfile.count({ where: { isOwner: true } }) -> ownerExists
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isSetupWizardLocked } from "@/services/setupWizardStatus";
import { hasWizardSession } from "@/services/wizardSession";
import { prisma } from "@/services/prisma";

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
    const seedEmailSet = Boolean(process.env.SEED_ADMIN_EMAIL);
    const seedPasswordSet = Boolean(process.env.SEED_ADMIN_PASSWORD);

    const ownerAdminCount = await prisma.adminProfile.count({ where: { isOwner: true } });
    const ownerExists = ownerAdminCount > 0;

    return NextResponse.json({
      success: true,
      data: { seedEmailSet, seedPasswordSet, ownerExists },
      message: "Admin status checked.",
    });
  } catch (error) {
    console.error("[api/system-setup-wizard/admin-status] Failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't check the admin status. Please try again." },
      { status: 500 }
    );
  }
}
