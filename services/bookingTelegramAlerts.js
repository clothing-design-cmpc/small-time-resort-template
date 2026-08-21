/**
 * FILE: services/bookingTelegramAlerts.js
 * PURPOSE:
 * Single place that builds and sends the admin Telegram message for
 * EVERY booking lifecycle event — new/pending, booked (admin
 * confirmed), cancelled (admin or guest self-cancel), auto-cancelled
 * (expiry cron), and rebooked (guest reschedule). Replaces the old
 * one-shot sendAdminBookingAlert in services/adminAlert.js (kept there
 * only as a thin re-export for backward compatibility) with one
 * function per event so each status gets its own wording/fields
 * instead of a single generic template being reused everywhere.
 *
 * Recipients and the low-level send call are unchanged from
 * services/adminAlert.js — SystemSettings.adminTelegramChatIds
 * (comma-separated), sent via services/telegram.js's
 * sendTelegramMessage(). Blank/unset silently disables every alert
 * below (not an error — same "not configured yet" pattern as before).
 *
 * DATA FLOW:
 * 1. A booking's status changes somewhere in the app (new booking
 *    created, admin confirms/cancels, guest self-cancels/reschedules,
 *    or the expiry cron auto-cancels a stale pending booking)
 * 2. That route calls the matching function below with the booking row
 * 3. getAdminAlertRecipients() reads the configured chat ID(s) +
 *    the resort's Facebook Messenger username (for the pending alert's
 *    link only) from SystemSettings in one query
 * 4. One Telegram message is sent to every configured chat ID in
 *    parallel — best-effort, never throws, never blocks the caller
 *
 * This file is server-side only — never import it in a "use client" file.
 */

import { prisma } from "./prisma.js";
import { sendTelegramMessage } from "./telegram.js";
import { buildMessengerLink } from "@/utils/messagingLinks";

const FULL_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

/**
 * getRecipientsAndMessengerLink
 * Reads SystemSettings.adminTelegramChatIds (parsed into a clean
 * array, same trimming/empty-filtering as before) AND
 * resortMessengerUsername in one query, since the pending-booking
 * alert is the only one that needs the Messenger link.
 */
async function getRecipientsAndMessengerLink() {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "singleton" },
    select: { adminTelegramChatIds: true, resortMessengerUsername: true },
  });

  const recipients = (settings?.adminTelegramChatIds ?? "")
    .split(",")
    .map((chatId) => chatId.trim())
    .filter(Boolean);

  const messengerLink = buildMessengerLink(settings?.resortMessengerUsername);

  return { recipients, messengerLink };
}

/**
 * formatDate
 * "YYYY-MM-DD" @db.Date column -> "January 5, 2027", consistent with
 * every other admin-facing date format already used across the
 * booking routes (confirm/cancel/reschedule route file headers).
 */
function formatDate(date) {
  if (!date) return "—";
  return FULL_DATE.format(new Date(date));
}

function formatCurrency(amount) {
  const value = Number(amount ?? 0);
  return `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const BOOKING_TYPE_LABEL = {
  overnight: "Overnight",
  day_tour: "Day Tour",
  night_tour: "Night Tour",
};

/**
 * formatBookingDetailsBlock
 * Shared "all the information of the booking" block every alert type
 * below includes — guest info, stay type/dates, guest count, and
 * amounts. Kept as one function so every alert stays consistent
 * instead of six near-duplicate hand-written blocks drifting apart.
 */
function formatBookingDetailsBlock(booking) {
  const typeLabel = BOOKING_TYPE_LABEL[booking.bookingType] ?? booking.bookingType ?? "—";
  const lines = [
    `Guest: ${booking.guestName}`,
    booking.guestPhone ? `Phone: ${booking.guestPhone}` : null,
    booking.guestEmail ? `Email: ${booking.guestEmail}` : null,
    `Type: ${typeLabel}`,
    `Dates: ${formatDate(booking.checkInDate)} → ${formatDate(booking.checkOutDate)}`,
    booking.numberOfGuests ? `Guests: ${booking.numberOfGuests}` : null,
    `Total: ${formatCurrency(booking.totalAmount)}`,
    `Deposit: ${formatCurrency(booking.depositAmount)}`,
    `Reference: ${booking.referenceCode}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * sendToAllRecipients
 * Fires sendTelegramMessage in parallel to every configured chat ID.
 * Returns false immediately (no network calls) if nothing is
 * configured — same early-return contract every caller already
 * expects from the old sendAdminBookingAlert.
 */
async function sendToAllRecipients(recipients, message) {
  if (recipients.length === 0) return false;
  const results = await Promise.all(recipients.map((chatId) => sendTelegramMessage({ chatId, message })));
  return results.some(Boolean);
}

/**
 * sendPendingBookingTelegramAlert
 * NEW BOOKING (status: "pending"). Includes every booking detail PLUS
 * the resort's Facebook Messenger link — the owner needs to jump
 * straight into the guest's Messenger thread to review/confirm, since
 * there's no PayMongo integration yet (see Booking.status's schema
 * comment).
 */
export async function sendPendingBookingTelegramAlert(booking) {
  const { recipients, messengerLink } = await getRecipientsAndMessengerLink();

  const message =
    `🛎️ NEW BOOKING — Pending\n\n` +
    `${formatBookingDetailsBlock(booking)}\n\n` +
    (messengerLink
      ? `Chat the guest on Messenger: ${messengerLink}\n\n`
      : "") +
    `Review and confirm from the super-admin Bookings page.`;

  return sendToAllRecipients(recipients, message);
}

/**
 * sendBookedBookingTelegramAlert
 * BOOKED (status flips pending -> "confirmed", either from the admin
 * "Confirm booking" action). Full details + explicit status line —
 * no Messenger link needed at this point, the guest is already
 * locked in.
 */
export async function sendBookedBookingTelegramAlert(booking) {
  const { recipients } = await getRecipientsAndMessengerLink();

  const message =
    `✅ BOOKING CONFIRMED — Booked\n\n` +
    `${formatBookingDetailsBlock(booking)}\n` +
    `Status: Confirmed`;

  return sendToAllRecipients(recipients, message);
}

/**
 * sendCancelledBookingTelegramAlert
 * CANCELLED — covers both an admin cancelling/rejecting a booking and
 * a guest self-service cancel. Information only, no Messenger link
 * (there's nothing left to follow up on for this booking).
 *
 * @param {object} booking
 * @param {"admin"|"guest"} initiatedBy - who cancelled it, shown in the message
 */
export async function sendCancelledBookingTelegramAlert(booking, initiatedBy = "admin") {
  const { recipients } = await getRecipientsAndMessengerLink();

  const initiatedLabel = initiatedBy === "guest" ? "by guest (self-service)" : "by admin";

  const message =
    `❌ BOOKING CANCELLED\n\n` +
    `${formatBookingDetailsBlock(booking)}\n` +
    `Status: Cancelled (${initiatedLabel})`;

  return sendToAllRecipients(recipients, message);
}

/**
 * sendAutoCancelledBookingTelegramAlert
 * AUTO-CANCEL — the expiry cron (services/bookingExpirySweep.js)
 * flipped a stale "pending" booking to "expired" because the owner
 * never confirmed it within the DP Countdown hold window. Information
 * only, no Messenger link — same as a manual cancel.
 */
export async function sendAutoCancelledBookingTelegramAlert(booking) {
  const { recipients } = await getRecipientsAndMessengerLink();

  const message =
    `⏰ BOOKING AUTO-CANCELLED\n\n` +
    `${formatBookingDetailsBlock(booking)}\n` +
    `Status: Expired (pending hold window passed, never confirmed)`;

  return sendToAllRecipients(recipients, message);
}

/**
 * sendRebookingTelegramAlert
 * REBOOKING — a guest moved an already-confirmed booking to new dates
 * via the self-service reschedule flow. Full current details + status,
 * plus the previous dates for context so the admin can see exactly
 * what changed at a glance.
 *
 * @param {object} updatedBooking - the booking row AFTER the reschedule
 * @param {object} previousDates - { checkInDate, checkOutDate } BEFORE the reschedule
 */
export async function sendRebookingTelegramAlert(updatedBooking, previousDates) {
  const { recipients } = await getRecipientsAndMessengerLink();

  const message =
    `🔄 BOOKING REBOOKED\n\n` +
    `${formatBookingDetailsBlock(updatedBooking)}\n` +
    `Previous dates: ${formatDate(previousDates.checkInDate)} → ${formatDate(previousDates.checkOutDate)}\n` +
    `Status: Confirmed (rebooked)`;

  return sendToAllRecipients(recipients, message);
}
