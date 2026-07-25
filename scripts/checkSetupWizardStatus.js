/**
 * FILE: scripts/checkSetupWizardStatus.js
 * PURPOSE:
 * Standalone, read-only diagnostic for app/system-setup-wizard's
 * AUTO-LOCK check (services/setupWizardStatus.js). Prints the exact
 * two conditions that determine whether the wizard 404s:
 *   1. Does an AdminProfile with isOwner: true exist?
 *   2. Is VaultPassphrase.passphraseHash set?
 * If BOTH are true, /system-setup-wizard returning 404 is CORRECT,
 * expected AUTO-LOCK behavior — not a bug. If either is false and the
 * wizard is still 404ing, that's a real bug worth digging into.
 *
 * Uses its own standalone PrismaClient (DIRECT_URL, no "@/" alias
 * resolution outside Next.js) — same reasoning as
 * scripts/checkSystemHealth.js's own header.
 *
 * USAGE: node scripts/checkSetupWizardStatus.js
 * (reads DIRECT_URL from .env.local via loadEnv.mjs)
 */
import "./loadEnv.mjs";
import prismaPkg from "@prisma/client";
const { PrismaClient } = prismaPkg;
import { PrismaPg } from "@prisma/adapter-pg";
import { logDbHost } from "./lib/logDbHost.js";

logDbHost("DIRECT_URL", process.env.DIRECT_URL);
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const ownerAdmins = await prisma.adminProfile.findMany({
    where: { isOwner: true },
    select: { id: true, fullName: true, createdAt: true },
  });

  const vaultPassphrase = await prisma.vaultPassphrase.findUnique({
    where: { id: "vault_passphrase" },
    select: { passphraseHash: true, updatedAt: true },
  });

  const hasOwnerAdmin = ownerAdmins.length > 0;
  const hasVaultPassphrase = Boolean(vaultPassphrase?.passphraseHash);
  const isLocked = hasOwnerAdmin && hasVaultPassphrase;

  console.log("\n=== Setup Wizard Lock Status ===\n");
  console.log(`Owner AdminProfile exists : ${hasOwnerAdmin ? "YES" : "no"}`);
  if (hasOwnerAdmin) {
    ownerAdmins.forEach((admin) =>
      console.log(`  - ${admin.fullName} (id: ${admin.id}, created: ${admin.createdAt.toISOString()})`)
    );
  }
  console.log(`VaultPassphrase set       : ${hasVaultPassphrase ? "YES" : "no"}`);
  if (hasVaultPassphrase) {
    console.log(`  - last updated: ${vaultPassphrase.updatedAt.toISOString()}`);
  }
  console.log(`\n/system-setup-wizard should currently be: ${isLocked ? "404 (locked)" : "reachable (Step 1 form)"}\n`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("[checkSetupWizardStatus] Failed:", error.message);
  await prisma.$disconnect();
  process.exit(1);
});
