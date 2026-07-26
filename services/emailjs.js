/**
 * FILE: services/emailjs.js
 * PURPOSE:
 * Shared, server-side-only core for sending email through EmailJS's
 * REST API (Rule 35.5's fixed email service). Wraps TWO EmailJS
 * templates:
 *   1. EMAILJS_GENERAL_TEMPLATE_ID — the dashboard's "Contact
 *      template" made generic. Used for everything that isn't a
 *      booking: contact inquiries, vault OTP codes, breach/rotation
 *      alerts, and the env-check test send.
 *   2. EMAILJS_BOOKING_TEMPLATE_ID — a dedicated template for booking
 *      confirmations, with its own fields (room, dates, total,
 *      deposit) instead of being squeezed into the general template's
 *      eyebrow/highlight-box fields.
 * Both go through the same low-level postToEmailJs() sender below so
 * the fetch call, error handling, and Strict Mode access token logic
 * live in exactly one place.
 *
 * Deliberately NOT the @emailjs/browser client SDK: that SDK only
 * works from the browser, and OTP codes in particular must never be
 * generated or handled client-side. This calls EmailJS's plain HTTPS
 * send endpoint instead — the same approach services/emailAlert.js
 * already uses for the breach alert, kept consistent here.
 *
 * TEMPLATE 1 CONTRACT ("Contact template", EMAILJS_GENERAL_TEMPLATE_ID):
 * Every sendGeneralEmail() call fills these merge tags — see the
 * dashboard edit steps below to switch the template from
 * contact-only fields to these:
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
 * TEMPLATE 1 DASHBOARD SETUP (one-time, EmailJS admin only — not code):
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
 *
 * TEMPLATE 2 CONTRACT (new "Booking template", EMAILJS_BOOKING_TEMPLATE_ID):
 * Every sendBookingEmail() call fills these merge tags:
 *   {{to_email}}          - guest's email address
 *   {{subject}}           - full email subject line
 *   {{reply_to}}          - Reply-To address (falls back to to_email)
 *   {{guest_name}}        - the guest's full name
 *   {{reference_code}}    - the booking's reference code
 *   {{room_name}}         - room/package name, or "Day Tour"/"Night Tour" for non-room bookings
 *   {{booking_type}}      - "overnight" | "day_tour" | "night_tour"
 *   {{check_in_date}}     - YYYY-MM-DD
 *   {{check_out_date}}    - YYYY-MM-DD (blank for single-day tours)
 *   {{nights}}            - number of nights, as a string (blank for single-day tours)
 *   {{number_of_guests}}  - guest count, as a string
 *   {{total_amount}}      - formatted total, e.g. "PHP 12,500.00"
 *   {{deposit_amount}}    - formatted deposit, e.g. "PHP 3,000.00" (blank if no deposit required)
 *   {{invoice_url}}       - link to download the invoice PDF (blank if site URL isn't configured)
 *
 * TEMPLATE 2 DASHBOARD SETUP (one-time, EmailJS admin only — not code):
 * 1. Email Templates → create a new template (do NOT reuse the
 *    Contact template — this one has its own field set).
 * 2. Subject field: {{subject}}. To Email: {{to_email}}. Reply To:
 *    {{reply_to}}. From Name: a static brand name, not a merge tag.
 * 3. In "Edit Content", lay out a confirmation email using the merge
 *    tags listed above — e.g. a highlighted box showing
 *    {{reference_code}}, {{room_name}}, {{check_in_date}} ->
 *    {{check_out_date}}, {{number_of_guests}} guests, and
 *    {{total_amount}} / {{deposit_amount}}, plus a line linking to
 *    {{{invoice_url}}} (triple braces, so it renders as a live link
 *    if the template wraps it in an <a href="{{{invoice_url}}}">).
 * 4. Save, then copy this template's ID into EMAILJS_BOOKING_TEMPLATE_ID.
 *
 * SHARED SETUP (both templates):
 * 1. Enable Strict Mode (Account > Security) and generate a Private
 *    Key so this server call can't be replayed from a leaked public key.
 * 2. Fill in .env.local: EMAILJS_SERVICE_ID, EMAILJS_GENERAL_TEMPLATE_ID,
 *    EMAILJS_BOOKING_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY
 *
 * Server-side only — never import this in a "use client" file.
 */

const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";

/**
 * postToEmailJs
 * Low-level sender shared by every template. Posts to EmailJS's REST
 * endpoint with the given template ID and merge-tag params. Best
 * effort: never throws, so a failed email never breaks the caller's
 * request — the caller decides what a false return means for its own
 * flow (e.g. an OTP send failing IS worth surfacing to the user,
 * since they can't get in without it).
 *
 * @param {string} templateId     - which EmailJS template to render
 * @param {object} templateParams - merge-tag values for that template
 */
async function postToEmailJs(templateId, templateParams) {
  const { EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY } = process.env;

  if (!EMAILJS_SERVICE_ID || !templateId || !EMAILJS_PUBLIC_KEY || !templateParams.to_email) {
    console.error("[emailjs] EmailJS env vars (or recipient) missing — skipping email.");
    return false;
  }

  try {
    const response = await fetch(EMAILJS_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: templateId,
        user_id: EMAILJS_PUBLIC_KEY,
        // Strict Mode private key — omit safely if strict mode isn't enabled yet.
        accessToken: EMAILJS_PRIVATE_KEY || undefined,
        template_params: templateParams,
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

/**
 * sendGeneralEmail
 * Fills the shared "Contact template" merge tags (Template 1 above)
 * and sends via EMAILJS_GENERAL_TEMPLATE_ID. Used for contact
 * inquiries, vault OTP codes, breach/rotation alerts, and the
 * env-check test send — anything that isn't a booking confirmation.
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
  const { EMAILJS_GENERAL_TEMPLATE_ID } = process.env;

  if (!EMAILJS_GENERAL_TEMPLATE_ID) {
    console.error("[emailjs] EMAILJS_GENERAL_TEMPLATE_ID missing — skipping email.");
    return false;
  }

  return postToEmailJs(EMAILJS_GENERAL_TEMPLATE_ID, {
    to_email: toEmail,
    subject,
    reply_to: replyTo || toEmail,
    eyebrow,
    heading,
    intro,
    highlight_line_1: highlightLine1,
    highlight_line_2: highlightLine2,
    body_message: bodyMessage,
  });
}

/**
 * sendBookingEmail
 * Fills the dedicated booking-template merge tags (Template 2 above)
 * and sends via EMAILJS_BOOKING_TEMPLATE_ID. Used exclusively by
 * app/api/bookings/route.js for the post-booking confirmation email —
 * carries the reference code, dates, room, and pricing the guest
 * needs, instead of overloading the general template's generic
 * eyebrow/highlight-box fields.
 *
 * @param {object} input
 * @param {string} input.toEmail         - guest's email address (required)
 * @param {string} input.subject         - full subject line (required)
 * @param {string} input.guestName       - guest's full name (required)
 * @param {string} input.referenceCode   - booking reference code (required)
 * @param {string} [input.replyTo]       - defaults to toEmail
 * @param {string} [input.roomName]      - room/package name, or tour label
 * @param {string} [input.bookingType]   - "overnight" | "day_tour" | "night_tour"
 * @param {string} [input.checkInDate]   - YYYY-MM-DD
 * @param {string} [input.checkOutDate]  - YYYY-MM-DD, blank for single-day tours
 * @param {number|string} [input.nights] - number of nights, blank for single-day tours
 * @param {number|string} [input.numberOfGuests] - guest count
 * @param {string} [input.totalAmount]   - formatted total, e.g. "PHP 12,500.00"
 * @param {string} [input.depositAmount] - formatted deposit, blank if none required
 * @param {string} [input.invoiceUrl]    - link to download the invoice PDF
 */
export async function sendBookingEmail({
  toEmail,
  subject,
  guestName,
  referenceCode,
  replyTo,
  roomName = "",
  bookingType = "",
  checkInDate = "",
  checkOutDate = "",
  nights = "",
  numberOfGuests = "",
  totalAmount = "",
  depositAmount = "",
  invoiceUrl = "",
}) {
  const { EMAILJS_BOOKING_TEMPLATE_ID } = process.env;

  if (!EMAILJS_BOOKING_TEMPLATE_ID) {
    console.error("[emailjs] EMAILJS_BOOKING_TEMPLATE_ID missing — skipping email.");
    return false;
  }

  return postToEmailJs(EMAILJS_BOOKING_TEMPLATE_ID, {
    to_email: toEmail,
    subject,
    reply_to: replyTo || toEmail,
    guest_name: guestName,
    reference_code: referenceCode,
    room_name: roomName,
    booking_type: bookingType,
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
    nights: String(nights ?? ""),
    number_of_guests: String(numberOfGuests ?? ""),
    total_amount: totalAmount,
    deposit_amount: depositAmount,
    invoice_url: invoiceUrl,
  });
}
