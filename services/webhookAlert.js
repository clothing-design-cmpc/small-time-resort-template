/**
 * FILE: services/webhookAlert.js
 * PURPOSE:
 * Sends a plain-text alert to a Slack or Discord incoming webhook, as a
 * SECOND, INDEPENDENT channel alongside the existing EmailJS alerts in
 * services/emailAlert.js. Never a replacement for those emails — always
 * an additional call from inside them (sendBreachAlertEmail() and
 * sendVaultPassphraseRotationEmail()), so a webhook failure never
 * blocks or replaces the email send, and vice versa.
 *
 * WHY THIS EXISTS:
 * If the vault owner's own email account is what's actually compromised
 * (or EmailJS itself is down/misconfigured), an email-only alert never
 * reaches anyone — the one channel a breach or passphrase rotation
 * relies on is exactly the one that might be unavailable. A second,
 * unrelated channel (a team Slack/Discord workspace, not tied to the
 * same inbox) closes that single point of failure.
 *
 * ONE ENV VAR, EITHER PLATFORM:
 * VAULT_ALERT_WEBHOOK_URL accepts either a Slack incoming-webhook URL
 * or a Discord webhook URL — no separate "which platform" config is
 * needed. The JSON body includes both a "text" field (what Slack reads)
 * and a "content" field (what Discord reads); each platform ignores the
 * field it doesn't recognize, so one payload shape works for both
 * without the caller ever needing to know which one is configured.
 *
 * Never includes the actual vault passphrase or OTP code in a webhook
 * message, even though sendVaultPassphraseRotationEmail() has the
 * plaintext available — a Slack/Discord workspace is typically visible
 * to more people than a single owner's inbox, so the webhook alert only
 * ever says a rotation HAPPENED, pointing back to the email for the
 * actual value.
 *
 * Server-side only — never import this in a "use client" file.
 */

/**
 * sendVaultWebhookAlert
 * Best-effort — never throws. A failed/unconfigured webhook must never
 * block or fail the caller's own email send; this is purely additive.
 * Returns true/false so the caller can report both channels' outcomes
 * separately, same pattern as email's emailSent/driveSaved booleans.
 *
 * @param {string} message - plain-text alert body, no HTML, no secrets
 */
export async function sendVaultWebhookAlert(message) {
  const webhookUrl = process.env.VAULT_ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    // Not configured — this is an OPTIONAL second channel, so a missing
    // URL is not an error, just a no-op. Logged at most once per call
    // site's own best-effort try/catch, never here.
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // "text" (Slack) and "content" (Discord) both included — each
      // platform reads only the field it understands and ignores the
      // other, so this one payload works for either webhook URL.
      body: JSON.stringify({ text: message, content: message }),
    });

    if (!response.ok) {
      console.error(`[webhookAlert] Webhook responded ${response.status}.`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[webhookAlert] Failed to send webhook alert:", error.message);
    return false;
  }
}
