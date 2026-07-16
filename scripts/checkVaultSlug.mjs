/**
 * FILE: scripts/checkVaultSlug.mjs
 * PURPOSE:
 * One-off diagnostic — prints the vault recovery URL/slug your server
 * currently computes from SystemSettings.vaultPassphraseHash (DB) or
 * VAULT_PASSPHRASE_HASH (.env.local) right now, so you can compare it
 * against whatever slug you're trying to visit in the browser.
 *
 * USAGE:
 *   node scripts/checkVaultSlug.mjs
 */
import "./loadEnv.mjs";
import { computeVaultUrlSlug, getVaultRecoveryUrl } from "../services/vaultAuth.js";
import { prisma } from "../services/prisma.js";

const slug = await computeVaultUrlSlug();
const url = await getVaultRecoveryUrl();

const settings = await prisma.systemSettings.findUnique({
  where: { id: "singleton" },
  select: { vaultPassphraseHash: true },
});

console.log("\n--- Vault slug diagnostic ---");
console.log("SystemSettings row exists:", Boolean(settings));
console.log("DB vaultPassphraseHash set:", Boolean(settings?.vaultPassphraseHash));
console.log("VAULT_PASSPHRASE_HASH (.env) set:", Boolean(process.env.VAULT_PASSPHRASE_HASH));
console.log("Currently active slug:", slug ?? "(none — vault not configured yet)");
console.log("Full recovery URL:", url);
console.log("------------------------------\n");

await prisma.$disconnect();
