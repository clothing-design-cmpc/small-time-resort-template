/**
 * FILE: app/api/cron/booking-expiry/route.js
 * ROLE: Vercel Cron only — see vercel.json's "crons" array
 *
 * PURPOSE:
 * Sweeps every "pending" Booking whose pendingExpiresAt has passed
 * (PENDING_HOLD_HOURS after creation — see services/bookingRules.js)
 * and flips it to "expired". This is what actually re-opens the dates:
 * the DB-level EXCLUDE constraint (prisma/addBookingExclusionConstraint.js)
 * and every overlap check (services/bookingPricing.js, app/api/bookings/
 * dates/route.js) only hold dates for "confirmed" and "pending" rows —
 * once a row is "expired" it's invisible to all of them.
 *
 * Scheduled frequently (every 15 minutes — see vercel.json) so a guest
 * who never confirms on Messenger doesn't hold a room far past the
 * 8-hour window in practice.
 *
 * DATA FLOW:
 * 1. Vercel Cron hits this route on schedule
 * 2. Finds every Booking with status "pending" and pendingExpiresAt
 *    in the past
 * 3. Bulk-updates them to status "expired", pendingExpiresAt untouched
 *    (kept as a historical record of when the hold was supposed to end)
 * 4. Logs one summary security event so an admin can see sweep activity
 *    in Security Logs without a row per expired booking
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { logSecurityEvent } from "@/services/securityLog";

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
      select: { id: true, guestName: true, referenceCode: true },
    });

    if (expiredBookings.length === 0) {
      return NextResponse.json({ success: true, data: { expiredCount: 0 }, message: "Nothing to expire." });
    }

    await prisma.booking.updateMany({
      where: { id: { in: expiredBookings.map((b) => b.id) } },
      data: { status: "expired" },
    });

    await logSecurityEvent({
      eventType: "admin_action",
      actor: "system:booking-expiry-cron",
      request: null,
      details: `Auto-expired ${expiredBookings.length} pending booking(s) past their 8-hour hold: ${expiredBookings
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
