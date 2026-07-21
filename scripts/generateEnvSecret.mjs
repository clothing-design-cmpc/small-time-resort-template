/**
 * FILE: scripts/generateEnvSecret.mjs
 * ROLE: Terminal-only — never imported by the app, never reachable
 *       over HTTP. Replaces the old "Generate VAULT_SETUP_KEY" /
 *       "Generate CRON_SECRET" buttons that used to live on
 *       app/system-vault-setup/VaultPassphraseSetupClient.jsx.
 *
 * PURPOSE:
 * Prints a fresh random secret to the terminal for either
 * VAULT_SETUP_KEY or CRON_SECRET (or both, if no name is given), so
 * you can paste it straight into .env.local and your deployment's env
 * vars. Nothing here is sent over a network, saved to a file, or
 * written to the database — it only ever exists in this terminal
 * session, exactly like the browser version used to only exist in
 * that one tab. Moving this to a terminal-only script removes the
 * need to even load /system-vault-setup in a browser just to generate
 * these two values, which is a smaller attack surface than a page
 * with a "reveal" box and a clipboard button.
 *
 * USAGE:
 *   node scripts/generateEnvSecret.mjs                 -> prints both
 *   node scripts/generateEnvSecret.mjs VAULT_SETUP_KEY  -> prints one
 *   node scripts/generateEnvSecret.mjs CRON_SECRET       -> prints one
 *
 * VAULT_SETUP_KEY reminder: this is the env-only disaster-recovery
 * master key (see services/adminSession.js's isValidVaultSetupKey())
 * — it must never be saved to the database, a text file, an email, or
 * any other persistent store outside your own env vars / password
 * manager. It never expires and is never rotated automatically.
 *
 * CRON_SECRET reminder: authenticates Vercel Cron's daily call to
 * /api/system-vault-setup/auto-rotate (see vercel.json). If you
 * regenerate this, update BOTH .env.local and your Vercel project's
 * env vars at the same time — a mismatch makes the cron job fail
 * silently with a 401.
 */
import { randomBytes } from "node:crypto";

const VALID_NAMES = ["VAULT_SETUP_KEY", "CRON_SECRET"];

/**
 * generateSecretValue
 * 32 random bytes from Node's CSPRNG, base64url-encoded — same
 * strength and format the old in-browser version produced
 * (crypto.getRandomValues), just generated here instead so the value
 * never has to touch a browser at all.
 */
function generateSecretValue() {
  return randomBytes(32).toString("base64url");
}

function printSecret(name) {
  console.log(`\n${name}=${generateSecretValue()}`);
}

const requestedName = process.argv[2]?.toUpperCase();

if (requestedName && !VALID_NAMES.includes(requestedName)) {
  console.error(
    `\nUnknown name "${process.argv[2]}". Expected one of: ${VALID_NAMES.join(", ")} (or no argument to print both).\n`
  );
  process.exit(1);
}

console.log("Generated secret(s) — copy the line(s) below into .env.local and your deployment's env vars.");
console.log("These are never saved anywhere by this script — copy them now.");

if (requestedName) {
  printSecret(requestedName);
} else {
  VALID_NAMES.forEach(printSecret);
}

console.log("");
