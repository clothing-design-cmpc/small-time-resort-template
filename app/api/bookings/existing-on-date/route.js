/**
 * FILE: app/api/bookings/existing-on-date/route.js
 * ROLE: Public — no auth required, called by components/RoomSelectionModal.jsx
 *
 * PURPOSE:
 * Given a check-in/check-out date range, returns every "pending" (still
 * within its DP Countdown hold) or "confirmed" Booking that overlaps
 * it — regardless of roomId, since Day Tour / Night Tour bookings are
 * often not tied to a specific room (whole-resort use). Lets Step 2
 * ("Choose Your Villa") show a small context banner when another guest
 * already has an active booking on the same date(s) — e.g. Guest A's
 * confirmed Day Tour showing up while Guest B is now picking a room for
 * an Overnight stay the same day. Never blocks anything by itself —
 * purely informational, same spirit as BookedDatesSection's busy-dates
 * display, just with the specific booking's name/status/type surfaced.
 *
 * Only guestName, status, bookingType, and (for "pending" rows only)
 * pendingExpiresAt are returned — never email, phone, notes, IP, or
 * any other field on the row (Rule 18's least-exposure principle
 * applies even though this endpoint is intentionally public-facing by
 * request). pendingExpiresAt powers RoomSelectionModal.jsx's live DP
 * Countdown display for a pending booking still waiting on payment.
 *
 * ALSO includes CHECKOUT-DAY bookings (relationship: "checkout"),
 * on top of true overlaps (relationship: "overlap"): an Overnight
 * booking whose checkout falls exactly on the new selection's own
 * check-in date deliberately does NOT block that date (same-day
 * turnover — see the exclusive-boundary overlap filter below) but the
 * visitor picking that date still benefits from seeing WHO checks out
 * that morning and, if that booking is still "pending", the same live
 * DP Countdown shown for a true conflict — the previous guest hasn't
 * actually confirmed yet, so the date isn't fully guaranteed free
 * until either that countdown resolves or the booking is confirmed.
 *
 * DATA FLOW:
 * 1. RoomSelectionModal calls GET /api/bookings/existing-on-date?checkin=&checkout=
 *    on mount / whenever the dates change (mirrors useAvailableRooms.js)
 * 2. Query every pending (unexpired hold) or confirmed booking
 * 3. Day Tour / Night Tour bookings store checkInDate === checkOutDate
 *    (same-day, no range) — treated here as occupying exactly that one
 *    date, exclusive-upper-bound day+1, same fix already applied in
 *    app/api/bookings/dates/route.js, to avoid the exact-day-equality
 *    overlap bug described there.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

function parseDateKey(key) {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * toLocalMidnight
 * Same normalization used by app/api/rooms/available/route.js — strips
 * a Prisma-returned @db.Date value down to its local calendar-day
 * components before comparing against a locally-constructed Date, so a
 * non-UTC server never introduces a false-negative/false-positive
 * overlap from timezone skew.
 */
function toLocalMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const checkInDate = parseDateKey(searchParams.get("checkin"));
    let checkOutDate = parseDateKey(searchParams.get("checkout")) ??
      (checkInDate ? new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate() + 1) : null);

    // Every single-date caller (a Tour selection, or BookingStatusModal.jsx
    // opened from a fully-booked day) sends checkout === checkin literally
    // (see hooks/useExistingBookingsOnDate.js's `checkout: checkOutDate ||
    // checkInDate`) rather than omitting it — so the `??` fallback above
    // never fires and checkOutDate lands equal to checkInDate. Every
    // overlap check below is exclusive-upper-bound (existingStart <
    // checkOutDate), so an equal checkin/checkout produced a zero-width
    // window that could never match ANY booking, even one sitting exactly
    // on that date. Normalize here instead: any checkOutDate that isn't
    // strictly after checkInDate is treated the same as "not provided" —
    // bumped to checkInDate + 1 day.
    if (checkInDate && checkOutDate && checkOutDate <= checkInDate) {
      checkOutDate = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate() + 1);
    }

    if (!checkInDate || !checkOutDate) {
      return NextResponse.json(
        { success: false, data: null, message: "A valid check-in and check-out date are required." },
        { status: 400 }
      );
    }

    // "pending" only counts while its DP Countdown hold is still active —
    // a stale pending row (hold already expired, cron hasn't swept it
    // to "expired" yet) shouldn't be shown as if it's still occupying
    // the date. Same defensive check app/api/bookings/dates/route.js
    // uses. EXCEPTION: a short-window (capped) hold past its scheduled
    // start is NEVER auto-expired (super-admin decides manually — see
    // Booking.pendingHoldCapped), so it still counts as occupying here.
    const candidateBookings = await prisma.booking.findMany({
      where: {
        OR: [
          { status: "confirmed" },
          { status: "pending", OR: [{ pendingExpiresAt: { gt: new Date() } }, { pendingHoldCapped: true }] },
        ],
      },
      select: {
        guestName: true,
        status: true,
        bookingType: true,
        checkInDate: true,
        checkOutDate: true,
        pendingExpiresAt: true,
        pendingHoldCapped: true,
        pendingHoldBreachedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const existingBookings = candidateBookings
      .filter((booking) => {
        const existingStart = toLocalMidnight(booking.checkInDate);
        // Day Tour / Night Tour save checkInDate === checkOutDate (a
        // same-day booking with no real range) — treat those as
        // occupying exactly that one date (existingStart + 1 day,
        // exclusive), same fix as app/api/bookings/dates/route.js.
        // Overnight already carries a real, correctly-exclusive
        // checkOutDate, so it's used as-is.
        const existingEnd =
          booking.bookingType === "overnight"
            ? toLocalMidnight(booking.checkOutDate)
            : new Date(existingStart.getFullYear(), existingStart.getMonth(), existingStart.getDate() + 1);
        // True overlap (blocks the new selection) OR a checkout-day
        // match (existingEnd lands exactly on the new selection's own
        // check-in — same-day turnover, doesn't block, but still
        // worth surfacing — see file header).
        const isOverlap = existingStart < checkOutDate && existingEnd > checkInDate;
        const isCheckoutDayMatch = booking.bookingType === "overnight" && existingEnd.getTime() === checkInDate.getTime();
        return isOverlap || isCheckoutDayMatch;
      })
      .map((booking) => {
        const existingStart = toLocalMidnight(booking.checkInDate);
        const existingEnd =
          booking.bookingType === "overnight"
            ? toLocalMidnight(booking.checkOutDate)
            : new Date(existingStart.getFullYear(), existingStart.getMonth(), existingStart.getDate() + 1);
        const isOverlap = existingStart < checkOutDate && existingEnd > checkInDate;
        return {
          guestName: booking.guestName,
          status: booking.status,
          bookingType: booking.bookingType,
          // Only meaningful while status is "pending" — the DP Countdown
          // widget in RoomSelectionModal.jsx uses this to tick down live.
          // null for "confirmed" (nothing to wait on).
          pendingExpiresAt: booking.status === "pending" ? booking.pendingExpiresAt : null,
          // Short-window (capped) hold — see Booking.pendingHoldCapped.
          // Lets the widget skip the ticking countdown once it's already
          // breached instead of showing a stuck "0h 00m 00s".
          pendingHoldCapped: booking.status === "pending" ? booking.pendingHoldCapped : false,
          pendingHoldBreached: booking.status === "pending" ? Boolean(booking.pendingHoldBreachedAt) : false,
          // "overlap" = actually occupies the new selection's dates.
          // "checkout" = only touches it as its own checkout morning —
          // doesn't block, purely informational (see file header).
          relationship: isOverlap ? "overlap" : "checkout",
        };
      });

    return NextResponse.json({
      success: true,
      data: existingBookings,
      message: "Existing bookings for this date fetched successfully.",
    });
  } catch (error) {
    console.error("[api/bookings/existing-on-date] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't check existing bookings for this date." },
      { status: 500 }
    );
  }
}
