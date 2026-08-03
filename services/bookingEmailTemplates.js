/**
 * FILE: services/bookingEmailTemplates.js
 * PURPOSE:
 * Shared source of truth for the four booking-lifecycle emails that
 * are NOT the "Booking Confirmed" email (that one keeps its own
 * dedicated services/bookingConfirmationEmail.js + images gallery).
 * Covers: pending (booking request received), cancelled (guest
 * self-cancel), auto_cancelled (hold expired), rebooked (reschedule).
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
 * Server-side only — never import this in a "use client" file. If a
 * client component only needs DEFAULT_TEMPLATE_COPY, TEMPLATE_LABELS,
 * or TEMPLATE_KEYS, import those from
 * ./bookingEmailTemplateConstants.js instead — that file has no
 * server-only imports and is safe in the browser bundle.
 */

import { prisma } from "./prisma.js";
import { DEFAULT_TEMPLATE_COPY, TEMPLATE_LABELS, TEMPLATE_KEYS } from "./bookingEmailTemplateConstants.js";

// Re-exported so every existing server-side import of these three
// names from THIS file keeps working unchanged.
export { DEFAULT_TEMPLATE_COPY, TEMPLATE_LABELS, TEMPLATE_KEYS };

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
