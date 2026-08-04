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
 * LOCAL DEV NOTE: Vercel Cron only fires against DEPLOYED
 * infrastructure — it never runs against `next dev` / localhost. If
 * you're testing this locally and pending bookings never seem to
 * auto-expire (or their auto-cancellation email never arrives), that's
 * why — this route simply never gets hit on your machine. Use the
 * super-admin "Run Expiry Sweep Now" button (Settings > Booking Rules
 * > DP Countdown section) to trigger the exact same sweep on demand
 * instead of waiting for a deploy.
 *
 * The actual sweep logic lives in services/bookingExpirySweep.js so
 * this route and the manual super-admin trigger share one
 * implementation — see that file for the step-by-step data flow.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { logSecurityEvent } from "@/services/securityLog";
import { runBookingExpirySweep } from "@/services/bookingExpirySweep";

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
    const { expiredCount, breachedCount, expiredReferenceCodes, breachedReferenceCodes } =
      await runBookingExpirySweep();

    if (expiredCount === 0 && breachedCount === 0) {
      return NextResponse.json({
        success: true,
        data: { expiredCount: 0, breachedCount: 0 },
        message: "Nothing to expire.",
      });
    }

    if (expiredCount > 0) {
      await logSecurityEvent({
        eventType: "admin_action",
        actor: "system:booking-expiry-cron",
        request: null,
        details: `Auto-expired ${expiredCount} pending booking(s) past their DP Countdown hold: ${expiredReferenceCodes.join(", ")}.`,
      });
    }

    if (breachedCount > 0) {
      await logSecurityEvent({
        eventType: "admin_action",
        actor: "system:booking-expiry-cron",
        request: null,
        details: `${breachedCount} short-window pending booking(s) breached their capped hold and need super-admin review: ${breachedReferenceCodes.join(", ")}.`,
      });
    }

    return NextResponse.json({
      success: true,
      data: { expiredCount, breachedCount },
      message: `Expired ${expiredCount} pending booking(s); flagged ${breachedCount} for review.`,
    });
  } catch (error) {
    console.error("[api/cron/booking-expiry] Failed to sweep pending bookings:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to sweep pending bookings." },
      { status: 500 }
    );
  }
}
