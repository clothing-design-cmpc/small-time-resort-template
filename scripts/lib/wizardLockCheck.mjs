/**
 * FILE: scripts/lib/wizardLockCheck.mjs
 * PURPOSE:
 * Standalone (outside Next.js) version of
 * services/setupWizardStatus.js's isSetupWizardLocked() — same three
 * conditions (owner AdminProfile exists AND VaultPassphrase is set
 * AND SystemSettings.setupFinalized is true), same "missing table /
 * unreachable DB = not locked" fallback.
 * scripts/checkSetupWizardStatus.js already re-implements this logic
 * inline for its printable diagnostic; this file extracts a reusable,
 * boolean-only version so scripts/postinstallSetup.mjs can gate the
 * setup guide's auto-open on it without duplicating the query pair a
 * third time.
 *
 * WHY THIS MUST NEVER THROW:
 * Called from postinstall, at the end of every `npm install` — on a
 * brand-new clone (no .env.local yet), DIRECT_URL is undefined, the
 * DB is unreachable, or admin_profiles/vault_passphrases/
 * system_settings don't exist yet (pre-`db push`). All of these mean
 * "setup obviously hasn't finished", not "crash the install" — so
 * every failure path here resolves to false (not locked), same
 * fallback services/setupWizardStatus.js uses for the live app.
 *
 * setupFinalized IS NOW REQUIRED, NOT JUST DERIVED:
 * Owner admin + vault existing is no longer enough on its own — the
 * guide keeps reopening through every `npm install` / `npm run dev`
 * until the developer explicitly clicks "Finished testing" on
 * SetupCompleteStep.jsx (Step 11), which sets
 * SystemSettings.setupFinalized. This mirrors
 * services/setupWizardStatus.js's isSetupWizardLocked() exactly, on
 * purpose — same three-condition AND, not an OR.
 */
import { existsSync } from "node:fs";

/**
 * isWizardLockedStandalone
 * Returns true only when a real, reachable Postgres connection
 * confirms an owner AdminProfile exists, a VaultPassphrase is set,
 * AND SystemSettings.setupFinalized is true. Returns false for every
 * other case (no .env.local yet, no DIRECT_URL, unreachable DB,
 * tables not migrated yet, finalize step not clicked yet, or any
 * unexpected error) — never throws.
 */
export async function isWizardLockedStandalone() {
  // No .env.local at all yet — nothing to connect to, definitely not locked.
  if (!existsSync(".env.local")) {
    return false;
  }

  try {
    const { config: loadEnvFile } = await import("dotenv");
    loadEnvFile();
    loadEnvFile({ path: ".env.local", override: true });

    if (!process.env.DIRECT_URL) {
      return false;
    }

    const prismaPkg = await import("@prisma/client");
    const { PrismaClient } = prismaPkg.default;
    const { PrismaPg } = await import("@prisma/adapter-pg");

    const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
    const prisma = new PrismaClient({ adapter });

    try {
      const [ownerAdminCount, vaultPassphrase, systemSettings] = await Promise.all([
        prisma.adminProfile.count({ where: { isOwner: true } }),
        prisma.vaultPassphrase.findUnique({
          where: { id: "vault_passphrase" },
          select: { passphraseHash: true },
        }),
        prisma.systemSettings.findUnique({
          where: { id: "singleton" },
          select: { setupFinalized: true },
        }),
      ]);

      const prerequisitesMet = ownerAdminCount > 0 && Boolean(vaultPassphrase?.passphraseHash);
      const isFinalized = Boolean(systemSettings?.setupFinalized);

      return prerequisitesMet && isFinalized;
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    // DB unreachable, tables not migrated yet, bad connection string,
    // or any other unexpected failure — treat as "not locked", never
    // let this bubble up and fail the calling script.
    return false;
  }
}
