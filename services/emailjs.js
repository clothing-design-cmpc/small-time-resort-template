/**
 * FILE: services/emailjs.js
 * PURPOSE:
 * Shared, server-side-only core for sending email through EmailJS's
 * REST API (Rule 35.5's fixed email service). Wraps ONE general-purpose
 * template (EMAILJS_GENERAL_TEMPLATE_ID, the dashboard's "Contact
 * template" made generic) so every use case — contact inquiries, vault
 * OTP codes, and anything else added later — sends through the same
 * reusable template instead of a new EmailJS template per feature.
 *
 * Deliberately NOT the @emailjs/browser client SDK: that SDK only
 * works from the browser, and OTP codes in particular must never be
 * generated or handled client-side. This calls EmailJS's plain HTTPS
 * send endpoint instead — the same approach services/emailAlert.js
 * already uses for the breach alert, kept consistent here.
 *
 * TEMPLATE CONTRACT ("Contact template", EMAILJS_GENERAL_TEMPLATE_ID):
 * Every send fills these merge tags — see the dashboard edit steps
 * below to switch the template from contact-only fields to these:
 *   {{to_email}}          - recipient address
 *   {{subject}}           - full email subject line
 *   {{reply_to}}          - Reply-To address (falls back to to_email)
 *   {{eyebrow}}           - small label above the heading, e.g. "VERIFICATION CODE"
 *   {{heading}}           - main headline, e.g. "Your vault OTP code"
 *   {{intro}}             - one paragraph of context
 *   {{highlight_line_1}}  - first line inside the highlighted box (optional)
 *   {{highlight_line_2}}  - second line inside the highlighted box (optional)
 *   {{body_message}}      - the main message content
 *
 * DASHBOARD SETUP (one-time, EmailJS admin only — not code):
 * 1. Open the existing "Contact template" and replace its fields:
 *    - Subject field: "Contact Us: {{title}}"  ->  "{{subject}}"
 *    - To Email field: the hardcoded address    ->  "{{to_email}}"
 *    - Reply To field: keep as "{{email}}"      ->  rename to "{{reply_to}}"
 *    - In "Edit Content" (raw content), replace:
 *        "MESSAGE RECEIVED"              -> {{eyebrow}}
 *        "A new inquiry has arrived."    -> {{heading}}
 *        the intro paragraph text        -> {{intro}}
 *        {{email}} inside the highlight box -> {{highlight_line_1}}
 *        {{time}} inside the highlight box  -> {{highlight_line_2}}
 *        {{message}}                     -> {{body_message}}
 * 2. Enable Strict Mode (Account > Security) and generate a Private
 *    Key so this server call can't be replayed from a leaked public key
 * 3. Fill in .env.local: EMAILJS_SERVICE_ID, EMAILJS_GENERAL_TEMPLATE_ID,
 *    EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY
 *
 * Server-side only — never import this in a "use client" file.
 */

const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";

/**
 * sendGeneralEmail
 * Core sender — fills the shared "Contact template" merge tags above
 * and posts to EmailJS. Best-effort: never throws, so a failed email
 * never breaks the caller's request — the caller decides what a false
 * return means for its own flow (e.g. an OTP send failing IS worth
 * surfacing to the user, since they can't get in without it).
 *
 * @param {object} input
 * @param {string} input.toEmail          - recipient address (required)
 * @param {string} input.subject          - full subject line (required)
 * @param {string} input.heading          - main headline (required)
 * @param {string} [input.replyTo]        - defaults to toEmail
 * @param {string} [input.eyebrow]        - small label above the heading
 * @param {string} [input.intro]          - one paragraph of context
 * @param {string} [input.highlightLine1] - first highlighted-box line
 * @param {string} [input.highlightLine2] - second highlighted-box line
 * @param {string} [input.bodyMessage]    - main message content
 */
export async function sendGeneralEmail({
  toEmail,
  subject,
  heading,
  replyTo,
  eyebrow = "",
  intro = "",
  highlightLine1 = "",
  highlightLine2 = "",
  bodyMessage = "",
}) {
  const {
    EMAILJS_SERVICE_ID,
    EMAILJS_GENERAL_TEMPLATE_ID,
    EMAILJS_PUBLIC_KEY,
    EMAILJS_PRIVATE_KEY,
  } = process.env;

  if (!EMAILJS_SERVICE_ID || !EMAILJS_GENERAL_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !toEmail) {
    console.error("[emailjs] EmailJS general-template env vars (or recipient) missing — skipping email.");
    return false;
  }

  try {
    const response = await fetch(EMAILJS_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_GENERAL_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        // Strict Mode private key — omit safely if strict mode isn't enabled yet.
        accessToken: EMAILJS_PRIVATE_KEY || undefined,
        template_params: {
          to_email: toEmail,
          subject,
          reply_to: replyTo || toEmail,
          eyebrow,
          heading,
          intro,
          highlight_line_1: highlightLine1,
          highlight_line_2: highlightLine2,
          body_message: bodyMessage,
        },
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      console.error(`[emailjs] EmailJS responded ${response.status}: ${bodyText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[emailjs] Failed to send email:", error.message);
    return false;
  }
}