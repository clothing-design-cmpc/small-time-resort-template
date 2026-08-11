/**
 * FILE: services/adminAlert.js
 * PURPOSE:
 * Sends a Telegram message to the resort's configured admin chat
 * ID(s) the moment a new Booking or WalkInInquiry comes in from the
 * visitor site. Mirrors services/emailAlert.js's structure — a thin,
 * best-effort layer on top of a low-level sender (services/telegram.js)
 * that never throws and never blocks the request that triggered it.
 *
 * Replaces the earlier SMS version of this file (services/smsAlert.js,
 * built on Semaphore) — switched to Telegram since it's free with no
 * per-message cost, at the one-time cost of each admin needing to
 * start a chat with the bot once (see services/telegram.js's setup
 * steps).
 *
 * Recipients come from SystemSettings.adminTelegramChatIds (Super-Admin
 * > Content > Policies & Content > Contact Info tab) — a comma-separated
 * list, since a resort may want more than one staff member notified.
 * Blank/unset disables the alert entirely (no error, just a skipped
 * send — same "not configured yet" pattern as the email alerts).
 *
 * This file is server-side only — never import it in a "use client" file.
 */

import { prisma } from "./prisma.js";
import { sendTelegramMessage } from "./telegram.js";

/**
 * getAdminAlertRecipients
 * Reads and parses SystemSettings.adminTelegramChatIds into a clean
 * array of chat IDs — trims whitespace, drops empty entries from
 * trailing/double commas. Returns [] if unset so callers can just
 * check .length instead of null-checking separately.
 */
async function getAdminAlertRecipients() {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "singleton" },
    select: { adminTelegramChatIds: true },
  });

  const raw = settings?.adminTelegramChatIds ?? "";
  return raw
    .split(",")
    .map((chatId) => chatId.trim())
    .filter(Boolean);
}

/**
 * sendAdminBookingAlert
 * Fired right after a new Booking is created (app/api/bookings/route.js).
 * Best-effort — never throws, so a failed/unconfigured alert never
 * fails an already-successful booking. Sends the same message to
 * every configured recipient in parallel.
 *
 * @param {object} input
 * @param {string} input.guestName
 * @param {string} input.checkInDate  - "YYYY-MM-DD", already formatted upstream
 * @param {string} input.checkOutDate - "YYYY-MM-DD"
 * @param {string} input.referenceCode
 */
export async function sendAdminBookingAlert({ guestName, checkInDate, checkOutDate, referenceCode }) {
  const recipients = await getAdminAlertRecipients();
  if (recipients.length === 0) {
    // Not configured — this is the expected default state, not an error.
    return false;
  }

  const message =
    `🛎️ New booking: ${guestName}\n` +
    `${checkInDate} → ${checkOutDate}\n` +
    `Ref: ${referenceCode}\n` +
    `Check the super-admin dashboard to review.`;

  const results = await Promise.all(recipients.map((chatId) => sendTelegramMessage({ chatId, message })));
  return results.some(Boolean);
}

/**
 * sendAdminWalkInAlert
 * Fired right after a new WalkInInquiry is created
 * (app/api/walkin-inquiry/route.js). Same best-effort, never-throw
 * contract as sendAdminBookingAlert above.
 *
 * @param {object} input
 * @param {string} input.guestName
 * @param {string} input.guestPhone
 */
export async function sendAdminWalkInAlert({ guestName, guestPhone }) {
  const recipients = await getAdminAlertRecipients();
  if (recipients.length === 0) {
    return false;
  }

  const message =
    `📞 New walk-in inquiry: ${guestName} (${guestPhone})\n` +
    `Requested a callback — check the super-admin dashboard for details.`;

  const results = await Promise.all(recipients.map((chatId) => sendTelegramMessage({ chatId, message })));
  return results.some(Boolean);
}
