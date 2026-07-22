/**
 * FILE: services/emailAlert.js
 * PURPOSE:
 * Sends the breach-alert email and the vault-passphrase-rotation email
 * via services/emailjs.js's sendGeneralEmail() — the SAME EmailJS
 * "Contact template" (EMAILJS_GENERAL_TEMPLATE_ID) already confirmed
 * working for vault OTP codes (services/vaultOtp.js). This intentionally
 * reuses that one working template instead of requiring two more
 * separate EmailJS templates (EMAILJS_BREACH_TEMPLATE_ID,
 * EMAILJS_VAULT_ROTATION_TEMPLATE_ID) that were never set up in the
 * EmailJS dashboard and were the reason these two sends were silently
 * skipped ("env vars are not set").
 *
 * Rule 35.5 normally calls for one template per email type, but here
 * the general/Contact template is deliberately generic (eyebrow,
 * heading, intro, two highlight lines, body message) specifically so
 * it can be reused across use cases without per-type EmailJS setup —
 * that's the whole point of services/emailjs.js's shared core.
 *
 * SETUP (one-time, EmailJS dashboard — same setup vaultOtp already needs):
 * 1. Make sure the "Contact template" has been switched to the generic
 *    merge tags documented at the top of services/emailjs.js.
 * 2. Fill in .env.local: EMAILJS_SERVICE_ID, EMAILJS_GENERAL_TEMPLATE_ID,
 *    EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY (Strict Mode),
 *    SUPER_ADMIN_ALERT_EMAIL, VAULT_OWNER_EMAIL.
 * No separate breach-alert or vault-rotation template needed anymore.
 *
 * This file is server-side only — never import it in a "use client" file.
 */

import { sendGeneralEmail } from "@/services/emailjs";
import { getVaultRecoveryUrl } from "@/services/vaultAuth";
import { sendVaultWebhookAlert } from "@/services/webhookAlert";

/**
 * sendBreachAlertEmail
 * Best-effort — never throws. A failed email must never stop the rest
 * of the breach response (IP block, lockdown, backup all still need
 * to happen even if this fails). Returns true/false so the caller can
 * record whether the alert actually went out.
 *
 * @param {object} input
 * @param {number} input.gatekeeper - 1, 2, or 3
 * @param {string|null} input.ipAddress
 * @param {string} input.details
 */
export async function sendBreachAlertEmail({ gatekeeper, ipAddress, details }) {
  // Second, independent channel — sent regardless of whether the email
  // below succeeds, so a compromised/unreachable inbox doesn't leave
  // this alert with nowhere to land. Never includes anything the email
  // itself doesn't already say; this is additive, not a replacement.
  await sendVaultWebhookAlert(
    `🚨 Breach Alert — Gatekeeper ${gatekeeper} triggered\nIP: ${ipAddress ?? "unknown"}\n${details}`
  );

  const superAdminEmail = process.env.SUPER_ADMIN_ALERT_EMAIL;
  if (!superAdminEmail) {
    console.error("[emailAlert] SUPER_ADMIN_ALERT_EMAIL is not set — skipping breach alert email.");
    return false;
  }

  return sendGeneralEmail({
    toEmail: superAdminEmail,
    subject: `Breach Alert — Gatekeeper ${gatekeeper}`,
    eyebrow: "SECURITY BREACH ALERT",
    heading: `Gatekeeper ${gatekeeper} triggered`,
    intro: `A breach-response gatekeeper fired at ${new Date().toISOString()}.`,
    highlightLine1: `IP: ${ipAddress ?? "unknown"}`,
    highlightLine2: details,
    bodyMessage:
      "Sign in to the super-admin recovery page to review the backup and restore the database.",
  });
}

/**
 * sendVaultPassphraseRotationEmail
 * Emails the brand-new vault passphrase to VAULT_OWNER_EMAIL right
 * after services/vaultAuth.js's rotateVaultPassphrase() generates it,
 * or after an owner-triggered manual generate. This is the ONLY place
 * the new plaintext passphrase is ever transmitted — never logged,
 * never included in any other response.
 *
 * Best-effort — never throws. If the email fails to send, the rotation
 * itself has still already happened (old passphrase is already dead) —
 * the caller logs a SecurityLog row either way so there's a durable
 * record even if this specific email never arrives.
 *
 * @param {object} input
 * @param {string} input.newPassphrase - plaintext, only ever passed here to be emailed
 * @param {string} input.reason - one-liner, e.g. "Gatekeeper 1 — Login brute force"
 */
export async function sendVaultPassphraseRotationEmail({ newPassphrase, reason }) {
  // Second, independent channel — sent regardless of whether the email
  // below succeeds. Deliberately never includes newPassphrase itself:
  // a Slack/Discord workspace is typically visible to more people than
  // a single owner's inbox, so this only confirms a rotation HAPPENED,
  // pointing back to the email for the actual value.
  await sendVaultWebhookAlert(
    `🔑 Vault passphrase rotated\nReason: ${reason}\nCheck the vault owner's email for the new passphrase.`
  );

  const vaultOwnerEmail = process.env.VAULT_OWNER_EMAIL;
  if (!vaultOwnerEmail) {
    console.error("[emailAlert] VAULT_OWNER_EMAIL is not set — skipping vault-rotation email.");
    return false;
  }

  const vaultRecoveryUrl = await getVaultRecoveryUrl();

  // Human-readable rotation timestamp for the email — the raw ISO string
  // ("2026-07-16T11:37:16.992Z") reads fine in a filename or a log row,
  // but is unnecessarily hard to parse at a glance in an email a real
  // person has to read quickly. Rendered in Philippine time (the resort
  // owner's timezone) with the offset spelled out explicitly.
  const rotatedAtReadable =
    new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    }) + " PHT";

  return sendGeneralEmail({
    toEmail: vaultOwnerEmail,
    subject: "Your vault passphrase was rotated",
    eyebrow: "VAULT PASSPHRASE ROTATED",
    heading: "New vault passphrase generated",
    intro: `Reason: ${reason}`,
    // Plain text only — no inline HTML. The EmailJS dashboard template
    // renders these fields escaped, so any HTML tags (the old <span>,
    // <br>, and <a> markup) show up as literal, broken-looking text in
    // the email instead of rendering. Plain text always reads cleanly
    // regardless of how the dashboard template treats the merge tag.
    highlightLine1: `NEW PASSPHRASE: ${newPassphrase}`,
    highlightLine2: `Rotated ${rotatedAtReadable}`,
    bodyMessage:
      `This is a brand-new passphrase, generated just now — it replaces every passphrase that came before it, and the old one no longer works.\n\n` +
      `Save it somewhere safe immediately: it will not be shown on-screen or emailed again after this message.\n\n` +
      // Recovery URL is deliberately on its own line with nothing after it —
      // putting punctuation (e.g. a trailing period) directly after a bare
      // URL causes some email clients' auto-linkers (Gmail included) to
      // swallow that character into the clickable link itself, producing a
      // slug that never matches computeVaultUrlSlug() and 404s.
      `This passphrase gates the disaster-recovery page here:\n` +
      `${vaultRecoveryUrl}\n\n` +
      `Generating another one from the dashboard will immediately replace this one too.\n` +
      `Keep this email private — do not forward or share it outside the resort owner.`,
  });
}

/**
 * sendVaultUrlRotationEmail
 * Task 5 — emails the brand-new recovery URL right after
 * services/vaultAuth.js's rotateVaultUrlSalt() generates it. Mirrors
 * sendVaultPassphraseRotationEmail above, but deliberately does NOT
 * include a passphrase — the whole point of this action is that the
 * passphrase is untouched, so this email only ever needs to say "the
 * link changed, here's the new one."
 *
 * Best-effort — never throws. If the email fails, the rotation itself
 * has already happened (old URL is already 404ing) — the caller logs
 * a SecurityLog row either way.
 *
 * @param {string} newVaultRecoveryUrl - the freshly-rotated full URL
 */
export async function sendVaultUrlRotationEmail(newVaultRecoveryUrl) {
  await sendVaultWebhookAlert(
    "🔗 Vault recovery URL rotated\nThe passphrase is unchanged. Check the vault owner's email for the new link."
  );

  const vaultOwnerEmail = process.env.VAULT_OWNER_EMAIL;
  if (!vaultOwnerEmail) {
    console.error("[emailAlert] VAULT_OWNER_EMAIL is not set — skipping vault-URL-rotation email.");
    return false;
  }

  const rotatedAtReadable =
    new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    }) + " PHT";

  return sendGeneralEmail({
    toEmail: vaultOwnerEmail,
    subject: "Your vault recovery URL was rotated",
    eyebrow: "VAULT URL ROTATED",
    heading: "New recovery URL generated",
    intro: "The vault passphrase is unchanged — only the link itself changed.",
    highlightLine1: `NEW URL: ${newVaultRecoveryUrl}`,
    highlightLine2: `Rotated ${rotatedAtReadable}`,
    bodyMessage:
      `This replaces every recovery URL that came before it — the old link now shows a plain 404, ` +
      `even with the correct passphrase.\n\n` +
      `Your passphrase itself has NOT changed — use the same one you already have on this new link.\n\n` +
      `Save this new link somewhere safe immediately: it will not be shown on-screen or emailed again ` +
      `after this message.\n\n` +
      `Keep this email private — do not forward or share it outside the resort owner.`,
  });
}