/**
 * FILE: scripts/printGatekeeperVaultUrl.js
 * PURPOSE:
 * Prints the current hidden Gatekeeper Vault path
 * (/gatekeeper-vault/<current-slug>) so you don't have to type a long
 * `node -e "import(...)..."` one-liner by hand.
 *
 * WHY THIS EXISTS: a bare `node -e "..."` does NOT load .env.local (only
 * Next.js's own dev/build process does that automatically), so calling
 * computeGatekeeperVaultUrlSlug() that way silently sees an empty
 * GATEKEEPER_VAULT_PASSPHRASE_HASH and can't compute the real slug.
 * This script loads env the same way scripts/hashGatekeeperVaultPassphrase.js
 * does (see scripts/loadEnv.mjs) before calling it, so it always sees
 * whatever is actually in .env.local.
 *
 * USAGE:
 *   node scripts/printGatekeeperVaultUrl.js
 */
import "./loadEnv.mjs";
import { getGatekeeperVaultPath } from "../services/gatekeeperVaultAuth.js";

const path = await getGatekeeperVaultPath();

if (!path) {
  console.error(
    "No GATEKEEPER_VAULT_PASSPHRASE_HASH is configured yet.\n" +
      'Run: node scripts/hashGatekeeperVaultPassphrase.js "your-chosen-passphrase"\n' +
      "then add the printed line to .env.local and run this again."
  );
  process.exitCode = 1;
} else {
  console.log(`\nhttp://localhost:3000${path}\n`);
}