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
 * WHAT IT DOES (in order):
 *   1. Generates a new random passphrase + rotates the DB row
 *      (services/vaultAuth.js's rotateVaultPassphrase() — this also
 *      rotates the hidden recovery URL slug, since the two are tied
 *      together; see that file's header for why)
 *   2. Emails the new plaintext passphrase to VAULT_OWNER_EMAIL
 *   3. Saves a matching .txt backup to Google Drive (retries once on
 *      failure — services/vaultPassphraseBackup.js)
 *   4. Logs a "vault_passphrase_set" SecurityLog row so this shows up
 *      in the Security Logs page same as any other rotation
 *
 * USAGE:
 *   npm run rotate-vault-passphrase
 *   npm run rotate-vault-passphrase -- "Suspected leak, rotating early"
 *   (the optional argument is just a human-readable reason for the
 *   audit log / Drive file — omit it and a generic default is used)
 *
 * Reads DIRECT_URL, VAULT_OWNER_EMAIL, EmailJS vars, and the Google
 * Drive OAuth vars the same way every other standalone script does —
 * from .env.local via scripts/loadEnv.mjs (or the real environment, if
 * you're running this somewhere those are already set as real env vars).
 */
import "./loadEnv.mjs";
import { rotateVaultPassphrase } from "../services/vaultAuth.js";
import { sendVaultPassphraseRotationEmail } from "../services/emailAlert.js";
import { saveVaultPassphraseToDrive } from "../services/vaultPassphraseBackup.js";
import { logSecurityEvent } from "../services/securityLog.js";
import { prisma } from "../services/prisma.js";

async function main() {
  const reason = process.argv[2] || "Manually rotated from the terminal (scripts/rotateVaultPassphrase.mjs).";

  console.log("[rotateVaultPassphrase] Rotating vault passphrase…");
  const newPassphrase = await rotateVaultPassphrase();

  console.log("[rotateVaultPassphrase] Emailing the new passphrase…");
  const emailSent = await sendVaultPassphraseRotationEmail({ newPassphrase, reason });

  console.log("[rotateVaultPassphrase] Saving a backup copy to Google Drive…");
  const { driveSaved, driveViewLink } = await saveVaultPassphraseToDrive({
    newPassphrase,
    generatedByLabel: reason,
  });

  await logSecurityEvent({
    eventType: "vault_passphrase_set",
    actor: "vault",
    details: `${reason}. Email sent: ${emailSent}. Saved to Drive: ${driveSaved}.`,
  });

  console.log("\n[rotateVaultPassphrase] Done.");
  console.log(`  Email sent to VAULT_OWNER_EMAIL: ${emailSent ? "yes" : "no — check server logs above"}`);
  console.log(`  Saved to Google Drive: ${driveSaved ? "yes" : "no — check server logs above"}`);
  if (driveViewLink) console.log(`  Drive file: ${driveViewLink}`);
  console.log(
    "\nThe new passphrase itself is NEVER printed to this terminal or logged anywhere —" +
      " check the VAULT_OWNER_EMAIL inbox (or the Drive backup above) to read it."
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
