/**
 * FILE: services/bookingExpirySweep.js
 * PURPOSE:
 * The actual sweep logic for auto-expiring stale "pending" bookings —
 * extracted out of app/api/cron/booking-expiry/route.js so it has
 * exactly ONE implementation, called from two places:
 *   1. app/api/cron/booking-expiry/route.js — hit by Vercel Cron on
 *      its every-15-minutes schedule (see vercel.json's "crons" array).
 *      Vercel Cron only ever fires against DEPLOYED infrastructure — it never runs against
 *      `next dev` / localhost, so during local development this sweep
 *      never happens on its own.
 *   2. app/api/superAdmin/settings/booking-rules/run-expiry-sweep/route.js
 *      — a super-admin-only manual trigger (see PendingHoldSection.jsx's
 *      "Run Expiry Sweep Now" button) so the exact same behavior can be
 *      tested locally on demand, instead of waiting for a deploy.
 *
 * See that cron route's own file header for the full behavior
 * description (capped/breached exception, email sends, etc.) — this
 * file is pure logic, no auth, no request parsing; both callers stay
 * responsible for their own auth gate.
 */
import { prisma } from "./prisma.js";
import { sendGeneralEmail } from "./emailjs.js";
import { getOrCreateEmailTemplate, renderTemplateText } from "./bookingEmailTemplates.js";
import { getResortDisplayName } from "./resortName.js";
import { sendAutoCancelledBookingTelegramAlert } from "./bookingTelegramAlerts.js";

const FULL_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

/**
 * runBookingExpirySweep
 * Finds every stale "pending" booking, flips the non-capped ones to
 * "expired" (emailing each guest), and flags the capped ones for
 * manual super-admin review. Returns the same counts both callers
 * report back to their own response shape.
 */
export async function runBookingExpirySweep() {
  const now = new Date();

  // Only the non-capped group is eligible for auto-expiry — see this
  // file's header EXCEPTION note.
  const expiredBookings = await prisma.booking.findMany({
    where: { status: "pending", pendingExpiresAt: { lt: now }, pendingHoldCapped: false },
    select: {
      id: true,
      guestName: true,
      guestPhone: true,
      guestEmail: true,
      bookingType: true,
      numberOfGuests: true,
      totalAmount: true,
      depositAmount: true,
      referenceCode: true,
      checkInDate: true,
      checkOutDate: true,
    },
  });

  // Capped bookings past their scheduled-start hold that haven't
  // already been flagged — stamp pendingHoldBreachedAt only, status
  // stays "pending" for the super-admin to decide manually.
  const breachedBookings = await prisma.booking.findMany({
    where: {
      status: "pending",
      pendingExpiresAt: { lt: now },
      pendingHoldCapped: true,
      pendingHoldBreachedAt: null,
    },
    select: { id: true, referenceCode: true },
  });

  if (expiredBookings.length === 0 && breachedBookings.length === 0) {
    return { expiredCount: 0, breachedCount: 0 };
  }

  if (expiredBookings.length > 0) {
    await prisma.booking.updateMany({
      where: { id: { in: expiredBookings.map((b) => b.id) } },
      data: { status: "expired" },
    });
  }

  if (breachedBookings.length > 0) {
    await prisma.booking.updateMany({
      where: { id: { in: breachedBookings.map((b) => b.id) } },
      data: { pendingHoldBreachedAt: now },
    });
  }

  // Admin Telegram alert — "Auto-Cancel" event (Task 1), one per
  // expired booking. Best-effort, never blocks the sweep — a failed
  // Telegram send must never stop the actual status update above,
  // which already happened.
  if (expiredBookings.length > 0) {
    Promise.all(expiredBookings.map((booking) => sendAutoCancelledBookingTelegramAlert(booking))).catch(
      (error) => {
        console.error("[bookingExpirySweep] Failed to send Telegram auto-cancel alert(s):", error.message);
      }
    );
  }

  // Best-effort auto-cancellation email per guest — never blocks the
  // sweep or the other guests' sends. Only the actually-expired
  // (non-capped) group; breached/capped bookings were never cancelled.
  if (expiredBookings.length > 0) {
    const [autoCancelledTemplate, resortName] = await Promise.all([
      getOrCreateEmailTemplate("auto_cancelled"),
      getResortDisplayName(),
    ]);

    await Promise.all(
      expiredBookings.map(async (booking) => {
        if (!booking.guestEmail) return;
        try {
          const mergeVars = { guestName: booking.guestName };
          await sendGeneralEmail({
            toEmail: booking.guestEmail,
            subject: `${resortName} — Booking Automatically Cancelled (${booking.referenceCode})`,
            eyebrow: renderTemplateText(autoCancelledTemplate.eyebrowText, mergeVars),
            heading: renderTemplateText(autoCancelledTemplate.headingText, mergeVars),
            intro: renderTemplateText(autoCancelledTemplate.introMessage, mergeVars),
            highlightLine1: `Reference code: ${booking.referenceCode}`,
            highlightLine2: `${FULL_DATE.format(booking.checkInDate)} → ${FULL_DATE.format(booking.checkOutDate)}`,
            bodyMessage: renderTemplateText(autoCancelledTemplate.bodyMessage, mergeVars),
            emailType: "booking_auto_cancelled",
            relatedBookingId: booking.id,
          });
        } catch (error) {
          console.error(
            `[bookingExpirySweep] Failed to send auto-cancellation email for ${booking.referenceCode}:`,
            error.message
          );
        }
      })
    );
  }

  return {
    expiredCount: expiredBookings.length,
    breachedCount: breachedBookings.length,
    expiredReferenceCodes: expiredBookings.map((b) => b.referenceCode),
    breachedReferenceCodes: breachedBookings.map((b) => b.referenceCode),
  };
}
