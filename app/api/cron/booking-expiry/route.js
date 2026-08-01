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
 * Scheduled frequently (every 15 minutes — see vercel.json) so a guest
 * who never confirms on Messenger doesn't hold a room far past the
 * DP Countdown window in practice.
 *
 * DATA FLOW:
 * 1. Vercel Cron hits this route on schedule
 * 2. Finds every Booking with status "pending" and pendingExpiresAt
 *    in the past
 * 3. Bulk-updates them to status "expired", pendingExpiresAt untouched
 *    (kept as a historical record of when the hold was supposed to end)
 * 4. Best-effort auto-cancellation email sent to each guest with an
 *    email on file — never blocks the sweep or the other guests' sends
 * 5. Logs one summary security event so an admin can see sweep activity
 *    in Security Logs without a row per expired booking
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { logSecurityEvent } from "@/services/securityLog";
import { sendGeneralEmail } from "@/services/emailjs";

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

    const expiredBookings = await prisma.booking.findMany({
      where: { status: "pending", pendingExpiresAt: { lt: now } },
      select: {
        id: true,
        guestName: true,
        guestEmail: true,
        referenceCode: true,
        checkInDate: true,
        checkOutDate: true,
      },
    });

    if (expiredBookings.length === 0) {
      return NextResponse.json({ success: true, data: { expiredCount: 0 }, message: "Nothing to expire." });
    }

    await prisma.booking.updateMany({
      where: { id: { in: expiredBookings.map((b) => b.id) } },
      data: { status: "expired" },
    });

    // Best-effort auto-cancellation email per guest — the guest asked for
    // this on the Booking Progress widget's countdown (never got a heads
    // up before, only Security Logs saw it happen). A failed send for one
    // guest must never block the others or the sweep itself, same pattern
    // as every other best-effort email in this codebase.
    await Promise.all(
      expiredBookings.map(async (booking) => {
        if (!booking.guestEmail) return;
        try {
          await sendGeneralEmail({
            toEmail: booking.guestEmail,
            subject: `your-private-resort — Booking Automatically Cancelled (${booking.referenceCode})`,
            eyebrow: "BOOKING AUTO-CANCELLED",
            heading: `Hi ${booking.guestName}, your hold has expired`,
            intro:
              "We didn't receive your DP and receipt within the hold window, so this booking request has been automatically cancelled and the dates have been released. If you'd still like to stay with us, you're welcome to submit a new booking request anytime.",
            highlightLine1: `Reference code: ${booking.referenceCode}`,
            highlightLine2: `${FULL_DATE.format(booking.checkInDate)} → ${FULL_DATE.format(booking.checkOutDate)}`,
            bodyMessage:
              "No further action is needed on this request. If you already sent your DP and this is a mistake, please contact us right away with your reference code.",
          });
        } catch (error) {
          console.error(
            `[api/cron/booking-expiry] Failed to send auto-cancellation email for ${booking.referenceCode}:`,
            error.message
          );
        }
      })
    );

    await logSecurityEvent({
      eventType: "admin_action",
      actor: "system:booking-expiry-cron",
      request: null,
      details: `Auto-expired ${expiredBookings.length} pending booking(s) past their DP Countdown hold: ${expiredBookings
        .map((b) => b.referenceCode)
        .join(", ")}.`,
    });

    return NextResponse.json({
      success: true,
      data: { expiredCount: expiredBookings.length },
      message: `Expired ${expiredBookings.length} pending booking(s).`,
    });
  } catch (error) {
    console.error("[api/cron/booking-expiry] Failed to sweep pending bookings:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to sweep pending bookings." },
      { status: 500 }
    );
  }
}
