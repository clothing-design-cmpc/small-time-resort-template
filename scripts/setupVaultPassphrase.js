/**
 * FILE: scripts/setupVaultPassphrase.js
 * PURPOSE:
 * One-time local setup for the vault passphrase (the hidden
 * disaster-recovery page's first factor). Reuses the exact same
 * rotate + email + R2-backup + audit-log flow every other
 * passphrase-generation trigger uses
 * (services/vaultPassphrase.js's generateAndDistributePassphrase()),
 * so this is not a separate, drifting implementation.
 *
 * DIFFERENT FROM scripts/hashVaultPassphrase.js:
 * hashVaultPassphrase.js is for manually choosing your own passphrase
 * later (referenced from the real vault dashboard's Scripts Reference
 * section) — it only ever prints a VAULT_PASSPHRASE_HASH line for you
 * to paste into .env.local, no email, no R2, no auto-generation. This
 * script is specifically the setup wizard's first-run bootstrap step
 * (Step 6, item 1) — auto-generates, saves straight to the database,
 * emails the plaintext to VAULT_OWNER_EMAIL, and backs up a .txt copy
 * to Cloudflare R2, exactly like scripts/rotateVaultPassphrase.mjs
 * does for a later rotation. The R2 filename uses a distinct
 * "setup-vault-passphrase-" prefix (vs. rotateVaultPassphrase.mjs's
 * "vault-passphrase-" prefix) so the R2 bucket listing makes clear
 * which file came from initial setup vs. a later rotation.
 *
 * USAGE:
 *   node scripts/setupVaultPassphrase.js
 *
 * OUTPUT:
 *   Prints the plaintext passphrase once (save it immediately — it is
 *   never stored or shown again), plus whether the email and R2 backup
 *   succeeded, plus the current vault recovery page URL.
 */
import "./loadEnv.mjs";
import { prisma } from "../services/prisma.js";
import { generateAndDistributePassphrase } from "../services/vaultPassphrase.js";
import { getVaultRecoveryUrl } from "../services/vaultAuth.js";

async function main() {
  // Refuse to run if a passphrase already exists — same first-run
  // bootstrap guard pattern used across this project's setup scripts.
  // Checks both the DB row and the env fallback, since either one
  // already satisfies the wizard's prerequisites (services/
  // setupWizardStatus.js's arePrerequisitesMet()).
  const existing = await prisma.vaultPassphrase.findUnique({
    where: { id: "vault_passphrase" },
    select: { passphraseHash: true },
  });
  const hasEnvFallback = Boolean(process.env.VAULT_PASSPHRASE_HASH);

  if (existing?.passphraseHash || hasEnvFallback) {
    console.error(
      "A vault passphrase already exists. Run `node scripts/rotateVaultPassphrase.mjs` instead if you intend to rotate it."
    );
    process.exit(1);
  }

  console.log("Generating vault passphrase…");
  const result = await generateAndDistributePassphrase({
    actor: "wizard-setup",
    reason: "Setup wizard: first-run vault passphrase generation (terminal)",
    generatedByLabel: "setup wizard, Step 6 (terminal)",
    r2KeyPrefix: "setup-vault-passphrase",
  });

  console.log("");
  console.log("Generated passphrase (save this now — it will not be shown again):");
  console.log(`  ${result.passphrase}`);
  console.log("");
  console.log(`Emailed to VAULT_OWNER_EMAIL: ${result.emailSent ? "yes" : "no — check server logs above"}`);
  console.log(`Saved to Cloudflare R2: ${result.r2Saved ? "yes" : "no — check server logs above"}`);
  if (result.r2SignedUrl) console.log(`R2 signed link (expires in 24h): ${result.r2SignedUrl}`);
  console.log("");
  console.log(`Vault recovery page: ${await getVaultRecoveryUrl()}`);
}

main().finally(() => process.exit());
