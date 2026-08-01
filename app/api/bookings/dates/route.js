/**
 * FILE: app/api/bookings/dates/route.js
 * ROLE: Public endpoint — called by BookedDatesSection.jsx and HowToBookSection.jsx
 *
 * PURPOSE:
 * Returns which calendar dates are already reserved by a confirmed
 * Booking, broken down by booking type so the visitor calendar can
 * apply the correct exclusivity rule instead of one flat "booked" flag:
 *   - Overnight blocks EVERYTHING on that date (Day Tour, Night Tour,
 *     and any other Overnight stay) — it's exclusive use of the villa.
 *   - Day Tour and Night Tour do NOT block each other — a same-day
 *     daytime visit and a separate evening visit can coexist on the
 *     same date, since they don't overlap in time.
 *   - Either Day Tour or Night Tour blocks a NEW Overnight booking for
 *     that date (the villa is already committed to a visit that day),
 *     and Overnight blocks new Day Tour / Night Tour bookings too.
 *
 * PREVIOUS BUG: Day Tour and Night Tour bookings save checkInDate ===
 * checkOutDate (same-day, no overnight). The old expandDateRange()
 * loop required `cursor < end`, which is immediately false when the
 * two dates are equal — so a confirmed Day Tour or Night Tour booking
 * never actually appeared in the booked-dates list at all, letting the
 * calendar show that date as fully open even with a confirmed booking
 * already on it. Fixed below by handling same-day bookings explicitly.
 *
 * DATA FLOW:
 * 1. Visitor loads the homepage; BookedDatesSection and HowToBookSection
 *    each fetch this route on mount
 * 2. Query confirmed bookings from the DB
 * 3. Expand each booking's occupied date(s) into the set matching its
 *    own booking type (overnight / day_tour / night_tour)
 * 4. Return both the per-type sets AND a backward-compatible flat
 *    `bookedDates` (any type present — used by BookedDatesSection's
 *    purely informational "busy dates" display, and as the safe
 *    default for any caller that hasn't been updated to the per-type
 *    fields yet)
 * 5. Also returns `overnightCheckoutDates` (the checkout day of each
 *    overnight booking, on its own) and `overnightBlocksDayTourDates`
 *    (overnightBookedDates + overnightCheckoutDates combined) — the
 *    checkout day must stay OUT of overnightBookedDates so a new
 *    overnight guest can still check in that day, but it must be IN
 *    overnightBlocksDayTourDates since checkout time overlaps Day
 *    Tour's morning start. Deliberately NOT applied to Night Tour —
 *    Night Tour starts in the evening, long after any reasonable
 *    checkout time, so it has no real overlap and stays bookable on
 *    the checkout day; only overnightBookedDates (occupied nights)
 *    blocks it, same as any other date. See HowToBookSection.jsx and
 *    BookingFormClient.jsx for where each set gets used.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

/**
 * toDateKey
 * Formats a Date as a local YYYY-MM-DD string — matches the format the
 * frontend carousels already use for their internal date keys.
 */
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * expandOvernightRange
 * Returns every date key from checkIn (inclusive) up to but not
 * including checkOut — standard hotel convention, so the checkout date
 * itself is free for the next guest to check in. Overnight-only; Day
 * Tour / Night Tour bookings are handled separately below since they
 * occupy exactly one date with no range to expand.
 */
function expandOvernightRange(checkIn, checkOut) {
  const keys = [];
  const cursor = new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate());
  const end = new Date(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate());

  while (cursor < end) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export async function GET() {
  try {
    const bookings = await prisma.booking.findMany({
      // "pending" holds these dates the same as "confirmed" (DP
      // Countdown soft-hold — see Booking.pendingExpiresAt) so the
      // visitor calendar shows them as unavailable while awaiting
      // owner confirmation, not just after it. But a "pending" row
      // whose pendingExpiresAt has already passed is stale — it's only
      // still "pending" in the DB because app/api/cron/booking-expiry/
      // route.js hasn't swept it to "expired" YET (runs every 15
      // minutes in production; doesn't run at all outside a deployed
      // Vercel Cron, e.g. local dev). Never trust the cron to have
      // already run before deciding what's actually blocking a
      // date — same defense-in-depth reasoning as the DB-level EXCLUDE
      // constraint backing up the app-level overlap check. A genuinely
      // still-open hold (pendingExpiresAt in the future) still blocks
      // normally.
      where: {
        OR: [
          { status: "confirmed" },
          { status: "pending", pendingExpiresAt: { gt: new Date() } },
        ],
      },
      select: { checkInDate: true, checkOutDate: true, bookingType: true },
    });

    // Tracked separately per type so the calendar can apply the
    // exclusivity rule described in the file header instead of one
    // flat "booked" boolean — see getEffectiveBookedSet() in
    // HowToBookSection.jsx for how these get combined per mode.
    const overnightSet = new Set();
    const dayTourSet = new Set();
    const nightTourSet = new Set();
    // The checkout DAY of each overnight booking, tracked on its own —
    // deliberately NOT merged into overnightSet, since a checkout day
    // must stay open for a new overnight guest to check in (standard
    // hotel convention). But it still needs to be visible on its own so
    // the calendar can show a "Checkout {time}" indicator there, and so
    // Day/Night Tour bookings can be correctly blocked on it below
    // (checkout time overlaps Day Tour's start — see the matching gte
    // fix in services/bookingPricing.js's exclusivity check).
    const overnightCheckoutSet = new Set();

    for (const booking of bookings) {
      if (booking.bookingType === "overnight") {
        for (const key of expandOvernightRange(booking.checkInDate, booking.checkOutDate)) {
          overnightSet.add(key);
        }
        overnightCheckoutSet.add(toDateKey(booking.checkOutDate));
      } else {
        // Day Tour / Night Tour — always a single same-day occupied
        // date (checkInDate === checkOutDate at booking time), so just
        // record that one date directly rather than trying to expand a
        // zero-length range (the bug described above).
        const key = toDateKey(booking.checkInDate);
        if (booking.bookingType === "day_tour") dayTourSet.add(key);
        else if (booking.bookingType === "night_tour") nightTourSet.add(key);
      }
    }

    // Backward-compatible flat list — "any booking of any type exists
    // on this date". Kept for BookedDatesSection.jsx's purely
    // informational "busy dates" carousel/mini-calendar, which doesn't
    // need type-level nuance, just "don't expect this date to be free".
    const bookedDateSet = new Set([...overnightSet, ...dayTourSet, ...nightTourSet]);

    // The set that should hide/block Day Tour specifically — occupied
    // nights PLUS the checkout day itself. Kept separate from
    // overnightBookedDates (which stays checkout-day-exclusive, for
    // blocking a NEW overnight booking) so callers can apply the
    // correct rule for whichever type they're checking. Deliberately
    // NOT used for Night Tour — see the file header for why.
    const overnightBlocksDayTourSet = new Set([...overnightSet, ...overnightCheckoutSet]);

    return NextResponse.json({
      success: true,
      data: {
        bookedDates: Array.from(bookedDateSet).sort(),
        overnightBookedDates: Array.from(overnightSet).sort(),
        overnightCheckoutDates: Array.from(overnightCheckoutSet).sort(),
        overnightBlocksDayTourDates: Array.from(overnightBlocksDayTourSet).sort(),
        dayTourBookedDates: Array.from(dayTourSet).sort(),
        nightTourBookedDates: Array.from(nightTourSet).sort(),
      },
      message: "Booked dates fetched successfully.",
    });
  } catch (error) {
    console.error("[api/bookings/dates] Failed to fetch booked dates:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load booked dates. Please try again." },
      { status: 500 }
    );
  }
}
