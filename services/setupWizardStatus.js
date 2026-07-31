/**
 * FILE: services/setupWizardStatus.js
 * PURPOSE:
 * Single source of truth for "has first-run setup already been
 * completed?" — used by app/system-setup-wizard/page.jsx AND every
 * route under app/api/system-setup-wizard/ to enforce the AUTO-LOCK
 * behavior: once setup is done, the wizard page 404s and every wizard
 * API route rejects, even if someone still knows the exact URL or has
 * the WIZARD_SETUP_KEY.
 *
 * LOCK NOW REQUIRES AN EXPLICIT FINALIZE STEP (changed):
 * Previously this locked purely off two derived DB facts (owner
 * AdminProfile + VaultPassphrase both existing) — no separate stored
 * flag, on purpose, so a manually-deleted admin would honestly
 * reopen the wizard. That meant the lock fired the moment those two
 * fields were set, even mid-testing, before the developer was
 * actually done — not what was wanted here. The lock now ALSO
 * requires SystemSettings.setupFinalized, set only by the explicit
 * button on SetupCompleteStep.jsx (Step 11) via
 * /api/system-setup-wizard/finalize-setup. This does reintroduce a
 * stored flag, deliberately: the tradeoff (button-driven, not
 * fully self-healing if the admin/vault rows are deleted later) was
 * chosen so the developer keeps full wizard access while testing,
 * even after the admin/vault rows exist, until they explicitly say
 * "done".
 *
 * arePrerequisitesMet() below is the ORIGINAL two-condition check —
 * still used on its own by the finalize-setup route (which needs to
 * confirm admin+vault are real BEFORE allowing the finalize flag to
 * be set — checking isSetupWizardLocked() there would be circular,
 * since locked now depends on the very flag that route sets).
 *
 * CRITICAL: every wizard route MUST call isSetupWizardLocked() and
 * bail out (404 for the page, a rejection response for API routes) at
 * the very top of the handler, BEFORE doing any other work — this is
 * what actually keeps the wizard closed after finalize, not just
 * hiding a nav link to it.
 *
 * MUST SURVIVE A PRE-`db push` DATABASE (Step 3 gap fix):
 * This is called at the very top of EVERY wizard route, including
 * verify-key (Step 1) and database-status (Step 2/3) — which are
 * exactly the routes hit on a brand-new clone, before `npx prisma db
 * push` has ever run. At that point admin_profiles, vault_passphrases,
 * and system_settings don't exist yet, so a plain query against them
 * throws (Prisma P2021 "table does not exist"), not returns null/0.
 * A missing table only ever means setup hasn't run yet, so it's
 * treated as "not locked", not an error.
 */
import { prisma } from "@/services/prisma";

/**
 * arePrerequisitesMet
 * Returns true once BOTH an owner AdminProfile and a set
 * VaultPassphrase exist. This is necessary but NOT sufficient for
 * isSetupWizardLocked() below — it's exposed separately so
 * finalize-setup/route.js can confirm the prerequisites are real
 * before allowing SystemSettings.setupFinalized to be set, without
 * calling isSetupWizardLocked() itself (which would be circular).
 */
export async function arePrerequisitesMet() {
  try {
    const [ownerAdminCount, vaultPassphrase] = await Promise.all([
      prisma.adminProfile.count({ where: { isOwner: true } }),
      prisma.vaultPassphrase.findUnique({
        where: { id: "vault_passphrase" },
        select: { passphraseHash: true },
      }),
    ]);

    return ownerAdminCount > 0 && Boolean(vaultPassphrase?.passphraseHash);
  } catch (error) {
    console.error("[setupWizardStatus] Prerequisite check failed — treating as not met:", error.message);
    return false;
  }
}

/**
 * isSetupWizardLocked
 * Returns true only once arePrerequisitesMet() is true AND the
 * developer has explicitly clicked "Finished testing" on
 * SetupCompleteStep.jsx (SystemSettings.setupFinalized). Until that
 * click happens, the wizard stays fully open — even after the admin
 * and vault rows exist — so testing/retesting earlier steps doesn't
 * get locked out prematurely.
 */
export async function isSetupWizardLocked() {
  const prerequisitesMet = await arePrerequisitesMet();
  if (!prerequisitesMet) return false;

  try {
    const systemSettings = await prisma.systemSettings.findUnique({
      where: { id: "singleton" },
      select: { setupFinalized: true },
    });

    return Boolean(systemSettings?.setupFinalized);
  } catch (error) {
    // system_settings not migrated yet, or unreachable — prerequisites
    // being met doesn't mean the finalize step ran, so still "not locked".
    console.error("[setupWizardStatus] Finalize flag check failed — treating as not locked:", error.message);
    return false;
  }
}
