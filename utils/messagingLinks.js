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
 * m.me/<username-or-id> opens a direct chat with the resort's Facebook
 * Page in Messenger (or the FB app's Messenger tab on mobile). The
 * admin is asked to enter just the Page username/ID from Super-Admin >
 * Policies & Content > Contact Info — never a full URL — but pages
 * that haven't set up a vanity username yet only HAVE a full URL to
 * copy, in one of these forms, which m.me does NOT accept as-is:
 *   - "facebook.com/profile.php?id=61551234567890" (no vanity username)
 *   - "facebook.com/pages/Your-Private-Resort/61551234567890" (legacy Page URL)
 *   - "facebook.com/yourprivateresort?ref=hl" (vanity username + stray query string)
 *   - "m.me/yourprivateresort" (already an m.me link, pasted whole)
 * A naive strip of just "facebook.com/" and a trailing slash leaves
 * "profile.php?id=..." or "pages/Name/..." sitting in front of the
 * numeric ID, producing a broken m.me link even though the URL the
 * admin copied was completely correct — this function extracts the
 * actual username/ID out of every one of those shapes before building
 * the link, instead of assuming the input is already a bare username.
 *
 * @param {string} pageUsername - Page username, numeric ID, or a full
 *   Facebook/m.me URL in any of the forms above
 * @returns {string|null} null if nothing usable was found
 */
export function buildMessengerLink(pageUsername) {
  let cleaned = String(pageUsername ?? "").trim();
  if (!cleaned) return null;

  // Already an m.me link — pull out just the path segment so we don't
  // end up building "m.me/m.me/username".
  const mDotMeMatch = cleaned.match(/^https?:\/\/(www\.)?m\.me\/([^/?#]+)/i);
  if (mDotMeMatch) {
    return `https://m.me/${mDotMeMatch[2]}`;
  }

  // "profile.php?id=NUMBER" — pages with no vanity username set. The
  // numeric ID after "id=" is the only part m.me actually needs.
  const profilePhpMatch = cleaned.match(/profile\.php\?id=(\d+)/i);
  if (profilePhpMatch) {
    return `https://m.me/${profilePhpMatch[1]}`;
  }

  // Legacy "pages/Page-Name/NUMBER" Page URL — the trailing numeric ID
  // is what m.me needs, not the human-readable name before it.
  const legacyPagesMatch = cleaned.match(/\/pages\/[^/]+\/(\d+)/i);
  if (legacyPagesMatch) {
    return `https://m.me/${legacyPagesMatch[1]}`;
  }

  // Normal vanity-username case (or a bare username/ID typed directly)
  // — strip the facebook.com/fb.com host, a leading "@", and anything
  // from a stray "?" or trailing slash onward.
  cleaned = cleaned
    .replace(/^https?:\/\/(www\.)?(facebook|fb)\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  if (!cleaned) return null;

  return `https://m.me/${cleaned}`;
}

/**
 * isMobileUserAgent
 * Lightweight client-side check (no server round trip, no ua-parser-js
 * dependency) used only to decide HOW to open a messaging deep link —
 * same-tab redirect on phones (so the OS hands off to the installed
 * app) vs a new browser tab on desktop (so the guest doesn't lose the
 * booking confirmation page). Not used anywhere security-sensitive —
 * services/deviceFingerprint.js's server-side ua-parser-js parsing is
 * the source of truth for anything that matters (Rule 38).
 *
 * @returns {boolean}
 */
export function isMobileUserAgent() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}
