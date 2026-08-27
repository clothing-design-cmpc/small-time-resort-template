/**
 * FILE: services/vaultPassphrase.js
 * PURPOSE:
 * Shared rotate + email + R2-backup + audit-log flow for generating a
 * brand-new vault passphrase. Used by THREE separate callers that must
 * never drift into slightly different flows:
 *   1. app/api/system-vault-setup/route.js GET  — auto-generate on
 *      first check if nothing is configured yet
 *   2. app/api/system-vault-setup/route.js POST — owner's manual
 *      "generate new" click
 *   3. scripts/setupVaultPassphrase.js — the setup wizard's Step 6
 *      terminal-only first-run bootstrap (passes r2KeyPrefix so its
 *      R2 backup filename is distinguishable from a later rotation)
 *
 * Previously this function lived directly inside
 * app/api/system-vault-setup/route.js (un-exported), and the wizard
 * route imported it from that sibling route file anyway. A route.js
 * file in the App Router can only export HTTP method handlers (GET,
 * POST, etc.) and a small set of reserved config exports (dynamic,
 * revalidate) — Turbopack correctly refuses to resolve any other named
 * export from one, which is exactly the "doesn't exist in target
 * module" build failure this file fixes. The function itself is
 * unchanged; it just now lives somewhere both callers can legitimately
 * import from.
 */
import { rotateVaultPassphrase } from "./vaultAuth.js";
import { sendVaultPassphraseRotationEmail } from "./emailAlert.js";
import { saveVaultPassphraseToR2 } from "./vaultPassphraseBackup.js";
import { logSecurityEvent } from "./securityLog.js";
import { sendVaultPassphraseTelegramAlert } from "./vaultTelegramAlerts.js";

/**
 * generateAndDistributePassphrase
 * Rotates the passphrase, emails the plaintext, sends it over
 * Telegram, saves a copy to Cloudflare R2, and writes the audit log
 * entry — email, Telegram, and R2 are all best-effort (a failure in
 * any one never blocks the caller from seeing the passphrase in its
 * own response, and never cancels the other two channels).
 *
 * @param {string} actor  - VAULT_IDENTITY (key-based path) or the session's uid
 * @param {string} reason - human-readable audit trail string, distinguishes
 *                 auto-generated (nothing set yet) from a manual
 *                 rotation (owner/wizard explicitly triggered it)
 * @param {object} request - forwarded to logSecurityEvent for IP/device capture
 * @param {string} generatedByLabel - text used inside the R2 .txt file body
 * @param {string} [r2KeyPrefix] - forwarded to saveVaultPassphraseToR2, see that
 *                 function's own doc for why a caller would set this
 */
export async function generateAndDistributePassphrase({ actor, reason, request, generatedByLabel, r2KeyPrefix }) {
  const newPassphrase = await rotateVaultPassphrase();

  // Email the plaintext to VAULT_OWNER_EMAIL — best-effort, reuses the
  // exact same template every trigger uses (Rule: one template per
  // email type, never duplicated per trigger).
  const emailSent = await sendVaultPassphraseRotationEmail({ newPassphrase, reason });

  // Save a .txt copy to Cloudflare R2 (private secrets/ key, never the
  // public CDN URL — see services/vaultPassphraseBackup.js's header)
  // as a second, durable place to find it later — also best-effort,
  // independent of the email above. Retries once on failure before
  // giving up, so a single transient R2 error doesn't silently skip
  // the backup.
  const { r2Saved, r2SignedUrl } = await saveVaultPassphraseToR2({
    newPassphrase,
    generatedByLabel,
    ...(r2KeyPrefix ? { keyPrefix: r2KeyPrefix } : {}),
  });

  // Third, independent channel — sent regardless of whether the email
  // above succeeded. Unlike services/emailAlert.js's sendVaultWebhookAlert()
  // companion ping (which deliberately omits the passphrase), this one
  // includes the plaintext code itself, per the owner's request that
  // EVERY new vault code also go out over Telegram, not just email.
  const telegramSent = await sendVaultPassphraseTelegramAlert({ newPassphrase, reason, generatedByLabel });

  // Audit trail — this is a disaster-recovery credential, always
  // logged with the admin (or the key-based VAULT_IDENTITY) who
  // triggered it, distinct from the "vault_passphrase_rotated"
  // auto-rotation event (actor: "vault") fired by breach response.
  await logSecurityEvent({
    eventType: "vault_passphrase_set",
    actor,
    request,
    details: `${reason}. Email sent: ${emailSent}. Telegram sent: ${telegramSent}. Saved to R2: ${r2Saved}.`,
  });

  return { passphrase: newPassphrase, emailSent, telegramSent, r2Saved, r2SignedUrl };
}