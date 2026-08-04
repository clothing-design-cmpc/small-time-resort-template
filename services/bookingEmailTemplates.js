/**
 * FILE: services/bookingEmailTemplates.js
 * PURPOSE:
 * Shared source of truth for the four booking-lifecycle emails that
 * are NOT the "Booking Confirmed" email (that one keeps its own
 * dedicated services/bookingConfirmationEmail.js + images gallery).
 * Covers: pending (booking request received), cancelled (guest
 * self-cancel, admin cancel of a confirmed booking, OR admin reject
 * of a still-pending one — all three send this same template, since
 * from the guest's side "the owner cancelled it" and "the owner
 * rejected it" read the same: their dates are gone, no charge, no
 * further action needed), auto_cancelled (hold expired because the
 * DP/receipt never arrived — kept as ITS OWN template, not merged
 * into "cancelled", because that one detail — this was automatic,
 * not a person deciding — is genuinely useful for the guest to know),
 * rebooked (reschedule).
 *
 * DATA FLOW:
 * 1. getOrCreateEmailTemplate(key) get-or-creates the singleton-style
 *    row for that key, seeding it with DEFAULT_TEMPLATE_COPY on first
 *    read — so the admin's Email Templates tab always shows the exact
 *    text currently going out, never a blank field.
 * 2. renderTemplateText() fills {{mergeTag}} placeholders (guestName,
 *    referenceCode, etc.) at send time — the same merge-tag idea
 *    services/emailjs.js already uses for its EmailJS template, just
 *    applied one level up to the admin-edited copy itself.
 * 3. Each booking route calls getOrCreateEmailTemplate() then
 *    renderTemplateText() before handing eyebrow/heading/intro/body
 *    to sendGeneralEmail().
 *
 * Server-side only — never import this in a "use client" file.
 */

import { prisma } from "./prisma.js";

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
      "Hi {{guestName}}, this confirms your booking has been cancelled and the dates have been released. If you think this is a mistake or have questions, please reach out to us.",
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

/**
 * getOrCreateEmailTemplate
 * Get-or-create for one template row, seeded with DEFAULT_TEMPLATE_COPY
 * on first read — same pattern as BookingConfirmationEmail's singleton.
 *
 * @param {"pending"|"cancelled"|"auto_cancelled"|"rebooked"} templateKey
 */
export async function getOrCreateEmailTemplate(templateKey) {
  const defaults = DEFAULT_TEMPLATE_COPY[templateKey];
  if (!defaults) {
    throw new Error(`[bookingEmailTemplates] Unknown templateKey: ${templateKey}`);
  }

  return prisma.bookingEmailTemplate.upsert({
    where: { id: templateKey },
    update: {},
    create: { id: templateKey, ...defaults },
  });
}

/**
 * getAllEmailTemplates
 * Get-or-creates all four rows in parallel — used by the super-admin
 * GET route so the tabbed editor always has every tab's copy on load.
 */
export async function getAllEmailTemplates() {
  const rows = await Promise.all(TEMPLATE_KEYS.map((key) => getOrCreateEmailTemplate(key)));
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

/**
 * renderTemplateText
 * Replaces every {{mergeTag}} occurrence in a piece of admin-edited
 * copy with the matching value from `vars`. Unknown tags are left
 * as-is rather than removed, so a typo in the admin field is visible
 * in the sent email instead of silently vanishing.
 *
 * @param {string} text
 * @param {Record<string, string>} vars
 */
export function renderTemplateText(text, vars = {}) {
  if (!text) return "";
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, tagName) => {
    return Object.prototype.hasOwnProperty.call(vars, tagName) ? String(vars[tagName]) : match;
  });
}