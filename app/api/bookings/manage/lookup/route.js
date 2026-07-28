/**
 * FILE: app/api/bookings/manage/lookup/route.js
 * ROLE: Public — no auth required, called by the visitor "Manage My
 *       Booking" floating widget (components/shared/ManageBookingWidget.jsx)
 *
 * PURPOSE:
 * First step of the self-service Rebook/Cancel flow: takes a reference
 * code and returns just enough of that booking to show the guest a
 * summary card (room, dates, status) before they choose Rebook or
 * Cancel. Same trust model as app/api/bookings/verify-reference/route.js
 * — the reference code IS the credential (deliberately unguessable, see
 * that route's docblock) — rate limited the same way to prevent brute-
 * forcing it.
 *
 * DATA FLOW:
 * 1. ManageBookingWidget POSTs { referenceCode }
 * 2. Rate limited to 10 attempts per 15 minutes per IP (Rule 32.1)
 * 3. Booking looked up by referenceCode; only a "confirmed" booking is
 *    considered manageable (a cancelled one has nothing left to do)
 * 4. Returns the display-safe summary the widget needs — never the
 *    full Booking row (no guestEmail/guestPhone/notes exposed here)
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/services/prisma";
import { checkRateLimit } from "@/services/rateLimit";
import { logSecurityEvent } from "@/services/securityLog";

const LOOKUP_MAX_ATTEMPTS = 10;
const LOOKUP_WINDOW_MS = 15 * 60 * 1000;

const lookupSchema = z.object({
  referenceCode: z.string().trim().min(1).max(40),
});

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkRateLimit(`manage-lookup:${ip}`, LOOKUP_MAX_ATTEMPTS, LOOKUP_WINDOW_MS);
  if (!allowed) {
    await logSecurityEvent({
      eventType: "rate_limit_hit",
      actor: null,
      request,
      details: `Exceeded ${LOOKUP_MAX_ATTEMPTS} manage-booking lookup attempts within 15 minutes.`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Too many attempts. Please try again in a bit." },
      { status: 429 }
    );
  }

  let payload;
  try {
    payload = lookupSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Please enter your reference code." },
      { status: 400 }
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { referenceCode: payload.referenceCode.toUpperCase() },
    select: {
      referenceCode: true,
      guestName: true,
      status: true,
      bookingType: true,
      checkInDate: true,
      checkOutDate: true,
      numberOfGuests: true,
      totalAmount: true,
      depositAmount: true,
      notes: true,
      roomId: true,
      room: { select: { name: true, bedType: true, amenityIds: true } },
    },
  });

  if (!booking || booking.status !== "confirmed") {
    return NextResponse.json({
      success: true,
      data: { found: false },
      message: booking
        ? "This booking has already been cancelled."
        : "That reference code wasn't found. Please check your invoice and try again.",
    });
  }

  // Resolves the room's amenityIds into display names — same pattern
  // app/api/rooms/[roomId]/route.js already uses for the "included
  // packages" list on the pre-booking reservation summary, so a guest
  // sees the same inclusion info here as they did when they first booked.
  const includedAmenities = booking.room?.amenityIds?.length
    ? await prisma.amenity.findMany({
        where: { id: { in: booking.room.amenityIds } },
        select: { name: true },
      })
    : [];

  return NextResponse.json({
    success: true,
    data: {
      found: true,
      booking: {
        referenceCode: booking.referenceCode,
        guestFirstName: booking.guestName.split(" ")[0],
        bookingType: booking.bookingType,
        checkInDate: booking.checkInDate.toISOString().slice(0, 10),
        checkOutDate: booking.checkOutDate.toISOString().slice(0, 10),
        numberOfGuests: booking.numberOfGuests,
        totalAmount: Number(booking.totalAmount),
        depositAmount: Number(booking.depositAmount),
        notes: booking.notes,
        roomId: booking.roomId,
        roomName: booking.room?.name ?? null,
        roomBedType: booking.room?.bedType ?? null,
        includedAmenities: includedAmenities.map((amenity) => amenity.name),
      },
    },
    message: "Booking found.",
  });
}
