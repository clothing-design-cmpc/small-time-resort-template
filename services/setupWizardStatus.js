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
 */
import { prisma } from "@/services/prisma";

/**
 * isSetupWizardLocked
 * Returns true once BOTH an owner AdminProfile and a set
 * VaultPassphrase exist — meaning first-run setup already ran to
 * completion and the wizard must refuse to serve any further request.
 */
export async function isSetupWizardLocked() {
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
}
