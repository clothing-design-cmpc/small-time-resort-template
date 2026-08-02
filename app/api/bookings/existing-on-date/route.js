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
    const checkOutDate = parseDateKey(searchParams.get("checkout")) ??
      (checkInDate ? new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate() + 1) : null);

    if (!checkInDate || !checkOutDate) {
      return NextResponse.json(
        { success: false, data: null, message: "A valid check-in and check-out date are required." },
        { status: 400 }
      );
    }

    // "pending" only counts while its DP Countdown hold is still active —
    // a stale pending row (hold already expired, cron hasn't swept it
    // to "expired" yet) shouldn't be shown as if it's still occupying
    // the date. Same defensive check app/api/bookings/dates/route.js uses.
    const candidateBookings = await prisma.booking.findMany({
      where: {
        OR: [
          { status: "confirmed" },
          { status: "pending", pendingExpiresAt: { gt: new Date() } },
        ],
      },
      select: {
        guestName: true,
        status: true,
        bookingType: true,
        checkInDate: true,
        checkOutDate: true,
        pendingExpiresAt: true,
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
        return existingStart < checkOutDate && existingEnd > checkInDate;
      })
      .map((booking) => ({
        guestName: booking.guestName,
        status: booking.status,
        bookingType: booking.bookingType,
        // Only meaningful while status is "pending" — the DP Countdown
        // widget in RoomSelectionModal.jsx uses this to tick down live.
        // null for "confirmed" (nothing to wait on).
        pendingExpiresAt: booking.status === "pending" ? booking.pendingExpiresAt : null,
      }));

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
