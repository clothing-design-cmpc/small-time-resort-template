/**
 * FILE: app/api/rooms/available/route.js
 * ROLE: Public — no auth required, called by the visitor room-selection modal
 *
 * PURPOSE:
 * Given a check-in/check-out date range, returns every active Room that
 * has NO overlapping confirmed Booking and NO overlapping BlackoutDate
 * for that range — i.e. exactly the rooms the visitor is allowed to
 * pick in components/RoomSelectionModal.jsx after the homepage
 * calendar (HowToBookSection.jsx) has already confirmed a matching
 * BookingRule exists for the selected dates. Each room includes its
 * amenities resolved to name/icon (never just the raw amenityIds),
 * since the reservation summary page needs to display "included
 * packages" as plain text without a second round-trip.
 *
 * DATA FLOW:
 * 1. RoomSelectionModal calls GET /api/rooms/available?checkin=&checkout=
 *    once the homepage calendar has confirmed a booking rule exists
 * 2. Every active room is checked for overlap against Booking
 *    (status: "confirmed") and BlackoutDate for the same range — same
 *    overlap logic app/api/rooms/[roomId]/availability/route.js uses
 *    per-room, just applied across every room in one query
 * 3. Rooms with zero overlaps are returned, each with amenities
 *    resolved by name so the modal and reservation page can render
 *    them as text without a separate amenities fetch
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
 * Reconstructs a Date using only its LOCAL calendar-day components
 * (year/month/day), discarding whatever time-of-day or timezone
 * representation it originally carried. Required before comparing a
 * Prisma-returned @db.Date value (which comes back as a UTC-midnight
 * Date object) against a locally-constructed Date like the ones from
 * parseDateKey() above — comparing those directly, without both sides
 * going through this first, silently introduces a several-hour skew on
 * any server whose local timezone isn't UTC, which flips exact-day
 * boundaries like a checkout-day check-in into a false overlap. Same
 * technique app/api/rooms/[roomId]/availability/route.js already uses
 * (there, inside expandRange) — applied here explicitly since this
 * route compares dates directly instead of expanding them into keys.
 */
function toLocalMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const checkInDate = parseDateKey(searchParams.get("checkin"));
    // A single-night/no-checkout selection still needs an exclusive
    // upper bound for the overlap check below — fall back to the day
    // right after check-in so a one-date selection behaves the same
    // way the per-room availability route already treats bookings
    // (checkOutDate is exclusive there too).
    const checkOutDate = parseDateKey(searchParams.get("checkout")) ??
      (checkInDate ? new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate() + 1) : null);

    if (!checkInDate || !checkOutDate) {
      return NextResponse.json(
        { success: false, data: null, message: "A valid check-in and check-out date are required." },
        { status: 400 }
      );
    }

    const rooms = await prisma.room.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        pricePerNight: true,
        dayTourPrice: true,
        nightTourPrice: true,
        capacity: true,
        bedType: true,
        imageUrl: true,
        amenityIds: true,
        bookings: {
          where: { status: "confirmed" },
          select: { checkInDate: true, checkOutDate: true },
        },
        blackoutDates: {
          select: { startDate: true, endDate: true },
        },
      },
    });

    // Resolve every referenced amenity once, up front, instead of one
    // query per room — rooms then just look their own amenityIds up
    // in this map.
    const allAmenityIds = Array.from(new Set(rooms.flatMap((room) => room.amenityIds)));
    const amenities = allAmenityIds.length
      ? await prisma.amenity.findMany({
          where: { id: { in: allAmenityIds } },
          select: { id: true, name: true, icon: true },
        })
      : [];
    const amenityById = new Map(amenities.map((amenity) => [amenity.id, amenity]));

    // A room's own confirmed bookings overlap the requested range when
    // existingStart < requestedEnd AND existingEnd > requestedStart —
    // the standard half-open interval overlap test, matching how
    // Booking.checkOutDate is already treated as exclusive elsewhere.
    // Every date on both sides is normalized to local midnight first
    // (see toLocalMidnight above) — comparing checkInDate/checkOutDate
    // straight from Prisma against checkInDate/checkOutDate from
    // parseDateKey() without that step was the actual bug: on a non-UTC
    // server the two sides silently disagreed by several hours, which
    // showed up as every room reporting unavailable for a check-in
    // that lands exactly on another booking's checkout day.
    const availableRooms = rooms
      .filter((room) => {
        const hasBookingOverlap = room.bookings.some((booking) => {
          const existingCheckIn = toLocalMidnight(booking.checkInDate);
          const existingCheckOut = toLocalMidnight(booking.checkOutDate);
          return existingCheckIn < checkOutDate && existingCheckOut > checkInDate;
        });
        if (hasBookingOverlap) return false;

        const hasBlackoutOverlap = room.blackoutDates.some((blackout) => {
          const blackoutStart = toLocalMidnight(blackout.startDate);
          const blackoutEnd = toLocalMidnight(blackout.endDate);
          return blackoutStart <= checkOutDate && blackoutEnd >= checkInDate;
        });
        return !hasBlackoutOverlap;
      })
      .map((room) => ({
        id: room.id,
        name: room.name,
        slug: room.slug,
        description: room.description,
        pricePerNight: Number(room.pricePerNight),
        dayTourPrice: Number(room.dayTourPrice),
        nightTourPrice: Number(room.nightTourPrice),
        capacity: room.capacity,
        bedType: room.bedType,
        imageUrl: room.imageUrl,
        amenities: room.amenityIds
          .map((amenityId) => amenityById.get(amenityId))
          .filter(Boolean),
      }));

    return NextResponse.json({
      success: true,
      data: availableRooms,
      message: "Available rooms fetched successfully.",
    });
  } catch (error) {
    console.error("[api/rooms/available] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load available rooms. Please try again." },
      { status: 500 }
    );
  }
}