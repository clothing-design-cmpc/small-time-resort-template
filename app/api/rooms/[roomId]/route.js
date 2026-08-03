/**
 * FILE: app/api/rooms/[roomId]/route.js
 * ROLE: Public — no auth required, called by the visitor reservation
 * summary page
 *
 * PURPOSE:
 * Returns one active room's visitor-facing details, with its
 * amenityIds resolved to name/icon — used by
 * app/visitor/booking/ReservationSummaryClient.jsx to display the
 * "included packages" (amenities) as plain text once a room has
 * already been chosen in RoomSelectionModal.jsx. Deliberately separate
 * from app/api/superAdmin/content/rooms/[roomId]/route.js, which is
 * the admin CRUD route and requires a super-admin session.
 *
 * DATA FLOW:
 * 1. ReservationSummaryClient reads ?roomId= from the URL and calls
 *    GET /api/rooms/{roomId}
 * 2. Only ever returns the room if it's still isActive — a room the
 *    admin deactivated between room-selection and this page loading
 *    is treated as not found, same as the availability route does
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

export async function GET(request, { params }) {
  const { roomId } = await params;

  try {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
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
        isActive: true,
        amenityIds: true,
      },
    });

    if (!room || !room.isActive) {
      return NextResponse.json(
        { success: false, data: null, message: "This room is no longer available." },
        { status: 404 }
      );
    }

    const amenities = room.amenityIds.length
      ? await prisma.amenity.findMany({
          where: { id: { in: room.amenityIds } },
          select: { id: true, name: true, icon: true },
        })
      : [];

    return NextResponse.json({
      success: true,
      data: {
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
        amenities,
      },
      message: "Room fetched successfully.",
    });
  } catch (error) {
    console.error("[api/rooms/[roomId]] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load this room. Please try again." },
      { status: 500 }
    );
  }
}
