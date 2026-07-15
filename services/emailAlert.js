/**
 * FILE: services/emailAlert.js
 * PURPOSE:
 * Sends the breach-alert email to the super-admin via EmailJS's REST
 * API (Rule 35.5's fixed email service) directly from the server —
 * @emailjs/browser is a client-only SDK, so this calls EmailJS's plain
 * HTTPS endpoint instead, which works identically from Node.
 *
 * SETUP (one-time, not code — do this in the EmailJS dashboard):
 * 1. Create a template named "breach_alert" with variables:
 *    {{gatekeeper}}, {{ip_address}}, {{details}}, {{occurred_at}},
 *    {{recovery_hint}}
 * 2. Enable "Strict Mode" (Account > Security) and generate a Private
 *    Key — required so this server call can't be replayed by anyone
 *    who found the public key in client bundle elsewhere in the app.
 * 3. Set these in .env.local:
 *    EMAILJS_SERVICE_ID, EMAILJS_BREACH_TEMPLATE_ID,
 *    EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY, SUPER_ADMIN_ALERT_EMAIL
 *
 * This file is server-side only — never import it in a "use client" file.
 */

const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";

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
  const {
    EMAILJS_SERVICE_ID,
    EMAILJS_BREACH_TEMPLATE_ID,
    EMAILJS_PUBLIC_KEY,
    EMAILJS_PRIVATE_KEY,
    SUPER_ADMIN_ALERT_EMAIL,
  } = process.env;

  if (!EMAILJS_SERVICE_ID || !EMAILJS_BREACH_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !SUPER_ADMIN_ALERT_EMAIL) {
    console.error("[emailAlert] EmailJS breach-alert env vars are not set — skipping email.");
    return false;
  }

  try {
    const response = await fetch(EMAILJS_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_BREACH_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        // Strict Mode private key — omit safely if strict mode isn't enabled yet.
        accessToken: EMAILJS_PRIVATE_KEY || undefined,
        template_params: {
          to_email: SUPER_ADMIN_ALERT_EMAIL,
          gatekeeper: String(gatekeeper),
          ip_address: ipAddress ?? "unknown",
          details,
          occurred_at: new Date().toISOString(),
          recovery_hint:
            "Sign in to the super-admin recovery page to review the backup and restore the database.",
        },
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      console.error(`[emailAlert] EmailJS responded ${response.status}: ${bodyText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[emailAlert] Failed to send breach alert email:", error.message);
    return false;
  }
}
