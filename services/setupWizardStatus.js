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
 * WHY NO NEW DB MODEL:
 * Setup completion is derived, not stored — it's already fully
 * determined by two existing tables:
 *   1. AdminProfile — at least one row with isOwner: true (created by
 *      `npx prisma db seed`, see prisma/seed.js)
 *   2. VaultPassphrase — passphraseHash is set (created by
 *      app/api/system-vault-setup, Step 8 of the wizard)
 * Both must be true for setup to count as complete. Adding a separate
 * "setupComplete" flag would just be a second, potentially
 * out-of-sync copy of information the DB already has — if someone
 * manually deletes the owner admin later, the wizard should honestly
 * reflect that setup is no longer complete, not stay permanently
 * locked off of a stale flag.
 *
 * CRITICAL: every wizard route MUST call isSetupWizardLocked() and
 * bail out (404 for the page, a rejection response for API routes) at
 * the very top of the handler, BEFORE doing any other work — this is
 * what actually keeps the wizard closed after first use, not just
 * hiding a nav link to it.
 *
 * MUST SURVIVE A PRE-`db push` DATABASE (Step 3 gap fix):
 * This is called at the very top of EVERY wizard route, including
 * verify-key (Step 1) and database-status (Step 2/3) — which are
 * exactly the routes hit on a brand-new clone, before `npx prisma db
 * push` has ever run. At that point admin_profiles and
 * vault_passphrases don't exist yet, so a plain query against them
 * throws (Prisma P2021 "table does not exist"), not returns null/0.
 * Unlike database-status/route.js's own checkDbPushDone() (which
 * already wraps its query for this same reason), this function used
 * to run unguarded — so the very first request of a fresh setup would
 * 500 instead of reaching Step 1. A missing table only ever means
 * setup hasn't run yet, so it's treated as "not locked", not an error.
 */
import { prisma } from "@/services/prisma";

/**
 * isSetupWizardLocked
 * Returns true once BOTH an owner AdminProfile and a set
 * VaultPassphrase exist — meaning first-run setup already ran to
 * completion and the wizard must refuse to serve any further request.
 * Returns false (never locked) if the underlying tables don't exist
 * yet — a fresh, not-yet-`db push`-ed database is the expected state
 * for early wizard steps, not a failure.
 */
export async function isSetupWizardLocked() {
  try {
    const [ownerAdminCount, vaultPassphrase] = await Promise.all([
      prisma.adminProfile.count({ where: { isOwner: true } }),
      prisma.vaultPassphrase.findUnique({
        where: { id: "vault_passphrase" },
        select: { passphraseHash: true },
      }),
    ]);

    const hasOwnerAdmin = ownerAdminCount > 0;
    const hasVaultPassphrase = Boolean(vaultPassphrase?.passphraseHash);

    return hasOwnerAdmin && hasVaultPassphrase;
  } catch (error) {
    // Database unreachable, or admin_profiles/vault_passphrases don't
    // exist yet (pre-`db push`) — setup clearly hasn't completed, so
    // treat this the same as "not locked" rather than crashing every
    // early wizard route.
    console.error("[setupWizardStatus] Lock check failed — treating as not locked:", error.message);
    return false;
  }
}
