/**
 * FILE: app/api/rooms/[roomId]/availability/route.js
 * ROLE: Public — no auth required, called by the visitor booking form
 *
 * PURPOSE:
 * Returns everything the booking form needs to disable unavailable
 * dates for one specific room: dates already covered by a confirmed
 * Booking, plus dates the super-admin closed off with a BlackoutDate
 * range for that room. Separate from app/api/bookings/dates/route.js,
 * which returns booked dates across ALL rooms combined (used by the
 * homepage's read-only Booked Dates / Availability calendar sections).
 *
 * DATA FLOW:
 * 1. BookingFormClient fetches this once a room is selected
 * 2. Confirmed bookings + blackout ranges for that room are each
 *    expanded into flat "YYYY-MM-DD" date keys and merged into one
 *    deduplicated, sorted "unavailableDates" array
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Expands [start, end] (inclusive on both ends — BlackoutDate ranges — or
 *  [start, end) exclusive-end for Booking ranges, per `inclusiveEnd`) into
 *  individual date keys. Same-day ranges (Day Tour / Night Tour, where
 *  checkInDate === checkOutDate) would otherwise expand to zero dates
 *  under the exclusive-end rule — handled explicitly here, mirroring the
 *  fix already applied in app/api/bookings/dates/route.js. */
function expandRange(start, end, inclusiveEnd) {
  if (start.getTime() === end.getTime()) {
    return [toDateKey(start)];
  }

  const keys = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const stop = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (inclusiveEnd ? cursor <= stop : cursor < stop) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export async function GET(request, { params }) {
  const { roomId } = await params;
  // Self-service Rebook (components/shared/RebookCalendarModal.jsx) passes
  // this so a guest's OWN current booking doesn't show as "unavailable"
  // on the calendar they're using to pick its new dates — the reference
  // code (not a raw DB id) is what the guest-facing side already treats
  // as the booking's identifier everywhere else (directions unlock, etc).
  const { searchParams } = new URL(request.url);
  const excludeReferenceCode = searchParams.get("excludeReferenceCode");

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || !room.isActive) {
      return NextResponse.json(
        { success: false, data: null, message: "This room is no longer available." },
        { status: 404 }
      );
    }

    let excludeBookingId = null;
    if (excludeReferenceCode) {
      const excludedBooking = await prisma.booking.findUnique({
        where: { referenceCode: excludeReferenceCode.toUpperCase() },
        select: { id: true },
      });
      excludeBookingId = excludedBooking?.id ?? null;
    }

    const [bookings, blackoutRanges] = await Promise.all([
      prisma.booking.findMany({
        where: {
          roomId,
          status: "confirmed",
          ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
        },
        select: { checkInDate: true, checkOutDate: true },
      }),
      prisma.blackoutDate.findMany({
        where: { roomId },
        select: { startDate: true, endDate: true, reason: true },
      }),
    ]);

    const unavailableSet = new Set();
    for (const booking of bookings) {
      for (const key of expandRange(booking.checkInDate, booking.checkOutDate, false)) {
        unavailableSet.add(key);
      }
    }
    for (const blackout of blackoutRanges) {
      for (const key of expandRange(blackout.startDate, blackout.endDate, true)) {
        unavailableSet.add(key);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        unavailableDates: Array.from(unavailableSet).sort(),
        capacity: room.capacity,
      },
      message: "Room availability fetched successfully.",
    });
  } catch (error) {
    console.error("[api/rooms/[roomId]/availability] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load this room's availability. Please try again." },
      { status: 500 }
    );
  }
}
