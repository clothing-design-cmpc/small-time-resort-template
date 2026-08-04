/**
 * FILE: services/bookingEmailTemplateConstants.js
 * PURPOSE:
 * Pure, static data for the 4 generic booking-lifecycle email
 * templates (pending, cancelled, auto_cancelled, rebooked) — the
 * default copy and the human-readable tab labels. Zero imports, so
 * this file is safe to import from BOTH server code and "use client"
 * components.
 *
 * WHY THIS FILE EXISTS (bug fix):
 * services/bookingEmailTemplates.js imports services/prisma.js (the
 * `pg` driver), which only runs in Node — it can't be bundled for the
 * browser (`pg` pulls in Node core modules like 'dns' and 'net').
 * BookingConfirmationEmailClient.jsx ("use client") only ever needed
 * TEMPLATE_LABELS, a plain object — but importing ANYTHING from
 * bookingEmailTemplates.js pulled the whole module, including its
 * prisma import, into the client bundle and broke the dev build with
 * "Module not found: Can't resolve 'dns'". Moving the plain-data
 * exports here, with no server-only imports, fixes that at the root:
 * client components import from THIS file, server code that needs
 * DB access keeps importing services/bookingEmailTemplates.js (which
 * re-exports these same constants for its own internal use and for
 * existing server-side consumers, so nothing else has to change).
 */

/**
 * DEFAULT_TEMPLATE_COPY
 * The exact copy each email sent before this feature existed — used
 * both as the row's `create` defaults (first read ever) and as the
 * fallback the admin form displays if a field is ever cleared to
 * empty. Keeping this here (not scattered across route files) is
 * what makes every route's copy admin-editable in one place.
 */
export const DEFAULT_TEMPLATE_COPY = {
  pending: {
    eyebrowText: "BOOKING PENDING",
    headingText: "Thanks, {{guestName}}!",
    introMessage:
      "We've received your booking request and are holding your dates. To confirm it, please send us your invoice PDF on Facebook Messenger — the instructions are printed on it. Keep your reference code below too; you'll need it once confirmed to unlock turn-by-turn directions.",
    bodyMessage:
      "What happens next:\n1. Make your down payment (DP).\n2. Send the payment receipt to us on Facebook Messenger.\n3. Wait for the resort owner to confirm your booking — you have {{pendingHoldRemaining}} from now to send your DP before these dates are released.\n\nDon't worry — once your booking is confirmed, you'll receive an email automatically.",
  },
  cancelled: {
    eyebrowText: "BOOKING CANCELLED",
    headingText: "Your booking has been cancelled",
    introMessage:
      "Hi {{guestName}}, this confirms your booking has been cancelled at your request and the dates have been released. If this wasn't you, please contact us right away.",
    bodyMessage: "No further action is needed. We'd love to have you another time — feel free to book again whenever you're ready.",
  },
  auto_cancelled: {
    eyebrowText: "BOOKING AUTO-CANCELLED",
    headingText: "Hi {{guestName}}, your hold has expired",
    introMessage:
      "We didn't receive your DP and receipt within the hold window, so this booking request has been automatically cancelled and the dates have been released. If you'd still like to stay with us, you're welcome to submit a new booking request anytime.",
    bodyMessage:
      "No further action is needed on this request. If you already sent your DP and this is a mistake, please contact us right away with your reference code.",
  },
  rebooked: {
    eyebrowText: "BOOKING REBOOKED",
    headingText: "Your dates have been updated, {{guestName}}!",
    introMessage: "Your stay at your-private-resort has been moved to the new dates below. Your reference code stays the same.",
    bodyMessage: "",
  },
};

/**
 * TEMPLATE_LABELS
 * Human-readable tab labels for the super-admin editor — kept next to
 * the defaults so both stay in sync when a new template key is added.
 */
export const TEMPLATE_LABELS = {
  pending: "Booking Pending",
  cancelled: "Booking Cancelled",
  auto_cancelled: "Auto-Cancelled",
  rebooked: "Booking Rebooked",
};

export const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATE_COPY);
