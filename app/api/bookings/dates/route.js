/**
 * FILE: app/api/bookings/dates/route.js
 * ROLE: Public endpoint — called by BookedDatesSection.jsx and HowToBookSection.jsx
 *
 * PURPOSE:
 * Returns every calendar date currently reserved by a confirmed Booking,
 * as a flat array of "YYYY-MM-DD" strings. Replaces the old hardcoded
 * BOOKED_DATES constant that used to live in BookedDatesSection.jsx —
 * both the Booked Dates carousel and the Availability calendar now
 * read from this one source of truth.
 *
 * DATA FLOW:
 * 1. Visitor loads the homepage; BookedDatesSection and HowToBookSection
 *    each fetch this route on mount
 * 2. Query confirmed bookings from the DB
 * 3. Expand each booking's [checkInDate, checkOutDate) range into
 *    individual date keys (checkout day itself is not occupied)
 * 4. Return a deduplicated, sorted array of date strings
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
 * expandDateRange
 * Returns every date key from checkIn (inclusive) up to but not
 * including checkOut — standard hotel convention, so the checkout date
 * itself is free for the next guest to check in.
 */
function expandDateRange(checkIn, checkOut) {
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
      where: { status: "confirmed" },
      select: { checkInDate: true, checkOutDate: true },
    });

    // Expand every booking's range and dedupe with a Set, since two
    // bookings for different rooms can share overlapping dates.
    const bookedDateSet = new Set();
    for (const booking of bookings) {
      for (const key of expandDateRange(booking.checkInDate, booking.checkOutDate)) {
        bookedDateSet.add(key);
      }
    }

    const bookedDates = Array.from(bookedDateSet).sort();

    return NextResponse.json({
      success: true,
      data: { bookedDates },
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
