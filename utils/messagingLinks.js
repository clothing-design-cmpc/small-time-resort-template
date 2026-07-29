/**
 * FILE: utils/messagingLinks.js
 * PURPOSE:
 * Builds "click-to-chat" deep links for the floating "Request a
 * callback" widget's Message Us row (components/shared/WalkInChatWidget.jsx)
 * — WhatsApp, Viber, and Facebook Messenger. Pure string builders, no
 * network calls and no secrets, so this is safe to import from both a
 * Server Component (app/visitor/layout.jsx, reading SystemSettings) and
 * the Client Component that renders the buttons.
 *
 * All three open the resort's own real app/website — never an embedded
 * widget — so there is no per-load API cost, matching the same
 * "free deep-link, no JS SDK" reasoning services/directions.js already
 * uses for its Google Maps "Open in Google Maps" link.
 */

/**
 * buildWhatsappLink
 * wa.me only accepts digits (country code + number, no "+", spaces, or
 * dashes) — this strips anything else the admin may have typed in the
 * Contact Info field before building the link.
 *
 * @param {string} phone - e.g. "+63 917 123 4567" or "639171234567"
 * @param {string} [prefillMessage] - optional pre-filled chat text
 * @returns {string|null} null if phone is empty/unset
 */
export function buildWhatsappLink(phone, prefillMessage = "") {
  const digitsOnly = String(phone ?? "").replace(/\D/g, "");
  if (!digitsOnly) return null;

  const params = prefillMessage ? `?text=${encodeURIComponent(prefillMessage)}` : "";
  return `https://wa.me/${digitsOnly}${params}`;
}

/**
 * buildViberLink
 * Viber's own "chat with a number" deep link — opens the Viber app
 * (mobile) or shows an app-store prompt if it isn't installed. Same
 * digits-only stripping as WhatsApp above.
 *
 * @param {string} phone - e.g. "+63 917 123 4567"
 * @returns {string|null} null if phone is empty/unset
 */
export function buildViberLink(phone) {
  const digitsOnly = String(phone ?? "").replace(/\D/g, "");
  if (!digitsOnly) return null;

  return `viber://chat?number=%2B${digitsOnly}`;
}

/**
 * buildMessengerLink
 * m.me/<username> opens a direct chat with the resort's Facebook Page
 * in Messenger (or the FB app's Messenger tab on mobile). The admin
 * enters just the Page username/ID from Super-Admin > Policies &
 * Content > Contact Info — never a full URL — so this strips any
 * accidental "facebook.com/" or "@" the admin might paste in by habit.
 *
 * @param {string} pageUsername - e.g. "yourprivateresort" (not a full URL)
 * @returns {string|null} null if username is empty/unset
 */
export function buildMessengerLink(pageUsername) {
  const cleaned = String(pageUsername ?? "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?(facebook|fb)\.com\//i, "")
    .replace(/\/+$/, "");
  if (!cleaned) return null;

  return `https://m.me/${cleaned}`;
}
