/**
 * FILE: app/api/cron/booking-expiry/route.js
 * ROLE: Vercel Cron only — see vercel.json's "crons" array
 *
 * PURPOSE:
 * Sweeps every "pending" Booking whose pendingExpiresAt has passed
 * (the DP Countdown window in effect when it was created — see
 * services/pendingHoldHours.js) and flips it to "expired". This is
 * what actually re-opens the dates:
 * the DB-level EXCLUDE constraint (prisma/addBookingExclusionConstraint.js)
 * and every overlap check (services/bookingPricing.js, app/api/bookings/
 * dates/route.js) only hold dates for "confirmed" and "pending" rows —
 * once a row is "expired" it's invisible to all of them.
 *
 * EXCEPTION — Short-Window (capped) holds (Booking.pendingHoldCapped):
 * A booking whose hold was capped to its own scheduled start (e.g. a
 * Day Tour booked an hour or two before it begins — see
 * services/bookingPricing.js's scheduledStartAt and app/api/bookings/
 * route.js) is NEVER auto-expired by this sweep. There's no realistic
 * time left for the guest to still confirm on Messenger before their
 * own tour starts, so instead of silently cancelling on them, this
 * route only stamps pendingHoldBreachedAt (once) and leaves status
 * "pending" — the super-admin decides from the Bookings list whether
 * to confirm or cancel it manually.
 *
 * Scheduled frequently (every 15 minutes — see vercel.json) so a guest
 * who never confirms on Messenger doesn't hold a room far past the
 * DP Countdown window in practice.
 *
 * DATA FLOW:
 * 1. Vercel Cron hits this route on schedule
 * 2. Finds every Booking with status "pending" and pendingExpiresAt
 *    in the past, split into two groups: pendingHoldCapped === false
 *    (auto-expire as before) and pendingHoldCapped === true (breach-flag
 *    only, see EXCEPTION above)
 * 3. Bulk-updates the non-capped group to status "expired",
 *    pendingExpiresAt untouched (kept as a historical record of when
 *    the hold was supposed to end); bulk-stamps pendingHoldBreachedAt
 *    on the capped group, status left untouched
 * 4. Best-effort auto-cancellation email sent to each newly-expired
 *    guest with an email on file — never blocks the sweep or the other
 *    guests' sends. Capped/breached bookings get no cancellation email
 *    since they were never actually cancelled.
 * 5. Logs one summary security event per group so an admin can see
 *    sweep activity in Security Logs without a row per booking
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { logSecurityEvent } from "@/services/securityLog";
import { sendGeneralEmail } from "@/services/emailjs";
import { getOrCreateEmailTemplate, renderTemplateText } from "@/services/bookingEmailTemplates";

const FULL_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

export async function GET(request) {
  // Vercel Cron requests carry this header — reject anything else so
  // this route can't be hit and abused as a public "expire bookings"
  // trigger (Rule 32.1's spirit, applied to a cron-only endpoint).
  const isVercelCron = request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (process.env.CRON_SECRET && !isVercelCron) {
    return NextResponse.json(
      { success: false, data: null, message: "Not authorized." },
      { status: 401 }
    );
  }

  try {
    const now = new Date();

    // Only the non-capped group is eligible for auto-expiry (see file
    // header EXCEPTION above).
    const expiredBookings = await prisma.booking.findMany({
      where: { status: "pending", pendingExpiresAt: { lt: now }, pendingHoldCapped: false },
      select: {
        id: true,
        guestName: true,
        guestEmail: true,
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
      return NextResponse.json({
        success: true,
        data: { expiredCount: 0, breachedCount: 0 },
        message: "Nothing to expire.",
      });
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

    // Best-effort auto-cancellation email per guest — the guest asked for
    // this on the Booking Progress widget's countdown (never got a heads
    // up before, only Security Logs saw it happen). A failed send for one
    // guest must never block the others or the sweep itself, same pattern
    // as every other best-effort email in this codebase. Only runs for
    // the actually-expired (non-capped) group — breached/capped bookings
    // were never cancelled, so they get no cancellation email here.
    //
    // Admin-editable copy (super-admin > Content > Booking Email
    // Templates > Auto-Cancelled) is fetched ONCE outside the loop —
    // it's the same row for every guest in this sweep, so re-fetching
    // it per booking would just be redundant DB load.
    if (expiredBookings.length > 0) {
      const autoCancelledTemplate = await getOrCreateEmailTemplate("auto_cancelled");

      await Promise.all(
        expiredBookings.map(async (booking) => {
          if (!booking.guestEmail) return;
          try {
            const mergeVars = { guestName: booking.guestName };
            await sendGeneralEmail({
              toEmail: booking.guestEmail,
              subject: `your-private-resort — Booking Automatically Cancelled (${booking.referenceCode})`,
              eyebrow: renderTemplateText(autoCancelledTemplate.eyebrowText, mergeVars),
              heading: renderTemplateText(autoCancelledTemplate.headingText, mergeVars),
              intro: renderTemplateText(autoCancelledTemplate.introMessage, mergeVars),
              highlightLine1: `Reference code: ${booking.referenceCode}`,
              highlightLine2: `${FULL_DATE.format(booking.checkInDate)} → ${FULL_DATE.format(booking.checkOutDate)}`,
              bodyMessage: renderTemplateText(autoCancelledTemplate.bodyMessage, mergeVars),
            });
          } catch (error) {
            console.error(
              `[api/cron/booking-expiry] Failed to send auto-cancellation email for ${booking.referenceCode}:`,
              error.message
            );
          }
        })
      );
    }

    if (expiredBookings.length > 0) {
      await logSecurityEvent({
        eventType: "admin_action",
        actor: "system:booking-expiry-cron",
        request: null,
        details: `Auto-expired ${expiredBookings.length} pending booking(s) past their DP Countdown hold: ${expiredBookings
          .map((b) => b.referenceCode)
          .join(", ")}.`,
      });
    }

    if (breachedBookings.length > 0) {
      await logSecurityEvent({
        eventType: "admin_action",
        actor: "system:booking-expiry-cron",
        request: null,
        details: `${breachedBookings.length} short-window pending booking(s) breached their capped hold and need super-admin review: ${breachedBookings
          .map((b) => b.referenceCode)
          .join(", ")}.`,
      });
    }

    return NextResponse.json({
      success: true,
      data: { expiredCount: expiredBookings.length, breachedCount: breachedBookings.length },
      message: `Expired ${expiredBookings.length} pending booking(s); flagged ${breachedBookings.length} for review.`,
    });
  } catch (error) {
    console.error("[api/cron/booking-expiry] Failed to sweep pending bookings:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to sweep pending bookings." },
      { status: 500 }
    );
  }
}
