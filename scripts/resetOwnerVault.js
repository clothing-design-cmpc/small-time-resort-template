/**
 * FILE: scripts/resetOwnerVault.js
 * PURPOSE:
 * Deletes the existing OwnerVault row (bcrypt passphrase + TOTP
 * secret) and any VaultSession rows tied to the owner vault
 * dashboard, so scripts/setupVault.js can be run again to create a
 * fresh vault. setupVault.js deliberately refuses to run while a
 * vault row already exists (prevents accidentally invalidating an
 * existing TOTP pairing) — this script is the explicit, intentional
 * way to clear that row when a reset is actually wanted.
 *
 * Requires an explicit --confirm flag so this can never run by
 * accident from a stray Enter press or copy-paste mistake.
 *
 * USAGE:
 *   node scripts/resetOwnerVault.js --confirm
 *
 * AFTER RUNNING:
 *   node scripts/setupVault.js
 *   (scan the new QR code with your authenticator app — the OLD one
 *   will no longer work)
 */
import "./loadEnv.mjs";
import { prisma } from "../services/prisma.js";

async function main() {
  if (process.argv[2] !== "--confirm") {
    console.error(
      "This deletes the existing owner vault (passphrase + TOTP secret) and its sessions.\n" +
        "Re-run with the --confirm flag if you're sure:\n\n" +
        "  node scripts/resetOwnerVault.js --confirm\n"
    );
    process.exitCode = 1;
    return;
  }

  const deletedSessions = await prisma.vaultSession.deleteMany({});
  const deletedVault = await prisma.ownerVault.deleteMany({});

  console.log(`Deleted ${deletedVault.count} owner vault row(s) and ${deletedSessions.count} session(s).`);
  console.log("Run `node scripts/setupVault.js` now to create a fresh one.");
}

main().finally(() => process.exit());
