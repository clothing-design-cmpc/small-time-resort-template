/**
 * FILE: scripts/hashGatekeeperVaultPassphrase.js
 * PURPOSE:
 * One-time offline CLI that turns a plaintext Gatekeeper Vault
 * passphrase into the "salt:hash" string stored in
 * GATEKEEPER_VAULT_PASSPHRASE_HASH (.env.local / host env). Never part
 * of the live app, never called by any API route — run manually
 * whenever this passphrase needs to be set or rotated. Separate secret
 * from scripts/hashVaultPassphrase.js — do not confuse the two.
 *
 * *** THIS SCRIPT IS DELIBERATELY NOT PART OF THE LIVE APP. ***
 *
 * USAGE:
 *   node scripts/hashGatekeeperVaultPassphrase.js "your-chosen-passphrase"
 *
 * Copy the printed value into GATEKEEPER_VAULT_PASSPHRASE_HASH — never
 * commit the plaintext passphrase itself anywhere, including this
 * terminal's shell history if the machine is shared.
 */
import "./loadEnv.mjs";
import { hashGatekeeperVaultPassphrase } from "../services/gatekeeperVaultAuth.js";

const plaintextPassphrase = process.argv[2];

if (!plaintextPassphrase || plaintextPassphrase.length < 12) {
  console.error(
    "Usage: node scripts/hashGatekeeperVaultPassphrase.js \"your-chosen-passphrase\"\n" +
      "Passphrase must be at least 12 characters."
  );
  process.exitCode = 1;
} else {
  const hashed = hashGatekeeperVaultPassphrase(plaintextPassphrase);
  console.log("\nAdd this line to .env.local:\n");
  console.log(`GATEKEEPER_VAULT_PASSPHRASE_HASH=${hashed}\n`);
}
