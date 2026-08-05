/**
 * FILE: app/api/rooms/route.js
 * ROLE: Public — no auth required, called by visitor-facing pages
 *
 * PURPOSE:
 * Returns the list of active rooms for visitor-facing display —
 * either every active room, or only the ones marked isFeatured when
 * ?featured=true is passed. This is distinct from
 * app/api/rooms/available/route.js, which instead takes a
 * checkin/checkout date range and filters by booking/blackout
 * availability. This route is used by hooks/usePublicRooms.js for
 * the homepage's featured rooms grid (and, later, a full room
 * listing page) — it has nothing to do with date-based availability.
 *
 * DATA FLOW:
 * 1. usePublicRooms(featuredOnly) calls GET /api/rooms, optionally
 *    with ?featured=true
 * 2. Active rooms are fetched, ordered by sortOrder, filtered by
 *    isFeatured when requested
 * 3. Amenities referenced by amenityIds are resolved to name/icon so
 *    the homepage grid can render them as text without a second fetch
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const featuredOnly = searchParams.get("featured") === "true";

    const rooms = await prisma.room.findMany({
      where: {
        isActive: true,
        ...(featuredOnly ? { isFeatured: true } : {}),
      },
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
        isFeatured: true,
        amenityIds: true,
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

    const publicRooms = rooms.map((room) => ({
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
      isFeatured: room.isFeatured,
      amenities: room.amenityIds
        .map((amenityId) => amenityById.get(amenityId))
        .filter(Boolean),
    }));

    return NextResponse.json({
      success: true,
      data: publicRooms,
      message: "Rooms fetched successfully.",
    });
  } catch (error) {
    console.error("[api/rooms] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the rooms right now. Please try again." },
      { status: 500 }
    );
  }
}
