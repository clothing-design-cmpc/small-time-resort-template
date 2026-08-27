/**
 * FILE: scripts/rotateVaultPassphrase.mjs
 * PURPOSE:
 * Forces an immediate vault passphrase rotation from the terminal —
 * same effect as clicking "Generate New Passphrase" on the vault
 * dashboard (app/api/system-vault-setup/route.js's POST handler), but
 * without needing a browser, a running server, or VAULT_SETUP_KEY.
 * Useful when you need a fresh passphrase right now and don't want to
 * spin up `npm run dev` first — e.g. right after suspecting the old
 * one leaked, or just to test the email + Drive backup flow.
 *
 * *** THIS SCRIPT IS DELIBERATELY NOT PART OF THE LIVE APP. *** Same
 * "decoupled from live traffic" reasoning as scripts/runBackup.js and
 * scripts/runEnvCheck.js — talks to the DB directly via DIRECT_URL,
 * never through a Next.js request.
 *
 * Routes through services/vaultPassphrase.js's shared
 * generateAndDistributePassphrase() — the SAME rotate + email +
 * Telegram + R2 + audit-log flow every other rotation path (the
 * manual "Generate New Passphrase" button, the Vercel cron route, and
 * scripts/rotateVaultPassphraseIfDue.mjs) already uses, so this
 * terminal script can never drift out of sync with them again (it
 * previously called email + R2 + logging directly and was missing the
 * Telegram alert every other path already had).
 *
 * WHAT IT DOES (in order):
 *   1. Generates a new random passphrase + rotates the DB row
 *      (services/vaultAuth.js's rotateVaultPassphrase() — this also
 *      rotates the hidden recovery URL slug, since the two are tied
 *      together; see that file's header for why)
 *   2. Emails the new plaintext passphrase to VAULT_OWNER_EMAIL
 *   3. Sends it to Telegram (services/vaultTelegramAlerts.js)
 *   4. Saves a matching .txt backup to Cloudflare R2 (private
 *      secrets/ key + presigned link, retries once on failure —
 *      services/vaultPassphraseBackup.js)
 *   5. Logs a "vault_passphrase_set" SecurityLog row so this shows up
 *      in the Security Logs page same as any other rotation
 *
 * USAGE:
 *   npm run rotate-vault-passphrase
 *   npm run rotate-vault-passphrase -- "Suspected leak, rotating early"
 *   (the optional argument is just a human-readable reason for the
 *   audit log / R2 file — omit it and a generic default is used)
 *
 * Reads DIRECT_URL, VAULT_OWNER_EMAIL, EmailJS vars, and the
 * CLOUDFLARE_R2_* vars the same way every other standalone script
 * does — from .env.local via scripts/loadEnv.mjs (or the real
 * environment, if you're running this somewhere those are already set
 * as real env vars).
 */
import "./loadEnv.mjs";
import { logDbHost } from "./lib/logDbHost.js";
import { VAULT_IDENTITY } from "../services/vaultAuth.js";
import { generateAndDistributePassphrase } from "../services/vaultPassphrase.js";
import { prisma } from "../services/prisma.js";

// See rotateVaultPassphraseIfDue.mjs's identical log lines for why —
// same shared services/prisma.js connection path, same failure mode.
logDbHost("DATABASE_URL", process.env.DATABASE_URL);
logDbHost("DIRECT_URL", process.env.DIRECT_URL);

async function main() {
  const reason = process.argv[2] || "Manually rotated from the terminal (scripts/rotateVaultPassphrase.mjs).";

  console.log("[rotateVaultPassphrase] Rotating vault passphrase…");
  const { emailSent, telegramSent, r2Saved, r2SignedUrl } = await generateAndDistributePassphrase({
    actor: VAULT_IDENTITY,
    reason,
    generatedByLabel: reason,
  });

  console.log("\n[rotateVaultPassphrase] Done.");
  console.log(`  Email sent to VAULT_OWNER_EMAIL: ${emailSent ? "yes" : "no — check server logs above"}`);
  console.log(`  Sent to Telegram: ${telegramSent ? "yes" : "no — check server logs above"}`);
  console.log(`  Saved to Cloudflare R2: ${r2Saved ? "yes" : "no — check server logs above"}`);
  if (r2SignedUrl) console.log(`  R2 signed link (expires in 24h): ${r2SignedUrl}`);
  console.log(
    "\nThe new passphrase itself is NEVER printed to this terminal or logged anywhere —" +
      " check the VAULT_OWNER_EMAIL inbox, Telegram, or the R2 backup link above (before it expires) to read it."
  );
}

main()
  .catch((error) => {
    console.error("[rotateVaultPassphrase] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
