/**
 * FILE: services/vaultPassphrase.js
 * PURPOSE:
 * Shared rotate + email + R2-backup + audit-log flow for generating a
 * brand-new vault passphrase. Used by TWO separate callers that must
 * never drift into slightly different flows:
 *   1. app/api/system-vault-setup/route.js GET  — auto-generate on
 *      first check if nothing is configured yet
 *   2. app/api/system-vault-setup/route.js POST — owner's manual
 *      "generate new" click
 *
 * The setup wizard's Step 6 no longer calls this — it now points at
 * scripts/hashVaultPassphrase.js (terminal-only), so the wizard has
 * no web-based passphrase-generation call at all anymore. See
 * services/setupWizardStatus.js's arePrerequisitesMet() for how the
 * terminal-set env value is treated as equally valid.
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
import { rotateVaultPassphrase } from "@/services/vaultAuth";
import { sendVaultPassphraseRotationEmail } from "@/services/emailAlert";
import { saveVaultPassphraseToR2 } from "@/services/vaultPassphraseBackup";
import { logSecurityEvent } from "@/services/securityLog";

/**
 * generateAndDistributePassphrase
 * Rotates the passphrase, emails the plaintext, saves a copy to
 * Cloudflare R2, and writes the audit log entry — email and R2 are
 * both best-effort (a failure in either never blocks the caller from
 * seeing the passphrase in its own response).
 *
 * @param actor  - VAULT_IDENTITY (key-based path) or the session's uid
 * @param reason - human-readable audit trail string, distinguishes
 *                 auto-generated (nothing set yet) from a manual
 *                 rotation (owner/wizard explicitly triggered it)
 * @param request - forwarded to logSecurityEvent for IP/device capture
 * @param generatedByLabel - text used inside the R2 .txt file body
 */
export async function generateAndDistributePassphrase({ actor, reason, request, generatedByLabel }) {
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
  });

  // Audit trail — this is a disaster-recovery credential, always
  // logged with the admin (or the key-based VAULT_IDENTITY) who
  // triggered it, distinct from the "vault_passphrase_rotated"
  // auto-rotation event (actor: "vault") fired by breach response.
  await logSecurityEvent({
    eventType: "vault_passphrase_set",
    actor,
    request,
    details: `${reason}. Email sent: ${emailSent}. Saved to R2: ${r2Saved}.`,
  });

  return { passphrase: newPassphrase, emailSent, r2Saved, r2SignedUrl };
}
