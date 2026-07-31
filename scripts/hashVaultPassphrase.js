/**
 * FILE: scripts/hashVaultPassphrase.js
 * PURPOSE:
 * One-time offline CLI that turns a plaintext vault passphrase into the
 * "salt:hash" string stored in VAULT_PASSPHRASE_HASH (.env.local / host
 * env). Never part of the live app, never called by any API route —
 * run manually whenever the vault passphrase needs to be set or rotated
 * by hand, choosing your own passphrase instead of an auto-generated
 * one. Referenced from the real vault dashboard's Scripts Reference
 * section (app/system-vault/[vaultSlug]/ScriptsReferenceSection.jsx) —
 * NOT used by the setup wizard's Step 6, which points at
 * scripts/setupVaultPassphrase.js instead (auto-generates, emails, and
 * backs up to R2 in one step, matching how the owner vault's own
 * setupVault.js script behaves).
 *
 * *** THIS SCRIPT IS DELIBERATELY NOT PART OF THE LIVE APP. *** Same
 * "decoupled from live traffic" reasoning as scripts/runBackup.js.
 *
 * USAGE:
 *   node scripts/hashVaultPassphrase.js "your-chosen-passphrase"
 *
 * Copy the printed value into VAULT_PASSPHRASE_HASH — never commit the
 * plaintext passphrase itself anywhere, including this terminal's
 * shell history if the machine is shared.
 */
import "./loadEnv.mjs";
import { hashVaultPassphrase } from "../services/vaultAuth.js";

const plaintextPassphrase = process.argv[2];

if (!plaintextPassphrase || plaintextPassphrase.length < 12) {
  console.error(
    "Usage: node scripts/hashVaultPassphrase.js \"your-chosen-passphrase\"\n" +
      "Passphrase must be at least 12 characters — this gates disaster recovery, make it long."
  );
  process.exitCode = 1;
} else {
  const hashed = hashVaultPassphrase(plaintextPassphrase);
  console.log("\nAdd this line to .env.local:\n");
  console.log(`VAULT_PASSPHRASE_HASH=${hashed}\n`);
}
