/**
 * FILE: scripts/checkVaultSlug.mjs
 * PURPOSE:
 * One-off diagnostic — prints the vault recovery URL/slug your server
 * currently computes from Vault.passphraseHash (DB) or
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

// Read from the actual model vaultAuth.js's getEffectivePassphraseHash()
// uses — the Vault singleton row, id "vault" — not SystemSettings, which
// has no vaultPassphraseHash field at all.
const vaultRow = await prisma.vault.findUnique({
  where: { id: "vault" },
  select: { passphraseHash: true },
});

console.log("\n--- Vault slug diagnostic ---");
console.log("Vault row exists:", Boolean(vaultRow));
console.log("DB passphraseHash set:", Boolean(vaultRow?.passphraseHash));
console.log("VAULT_PASSPHRASE_HASH (.env) set:", Boolean(process.env.VAULT_PASSPHRASE_HASH));
console.log("Currently active slug:", slug ?? "(none — vault not configured yet)");
console.log("Full recovery URL:", url);
console.log("------------------------------\n");

await prisma.$disconnect();
