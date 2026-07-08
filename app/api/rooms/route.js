/**
 * FILE: app/api/rooms/route.js
 * ROLE: Public — no auth required, called by the visitor site
 *
 * PURPOSE:
 * Read-only room listing for visitors. This is intentionally a separate
 * endpoint from /api/superAdmin/content/rooms, which is the admin CRUD
 * route protected by middleware.js. This route only ever returns rooms
 * marked isActive (published) and never exposes admin-only fields like
 * updatedBy or imageKey.
 *
 * DATA FLOW:
 * 1. hooks/usePublicRooms.js calls GET /api/rooms (optionally
 *    ?featured=true for the homepage's featured selection)
 * 2. Query is scoped to isActive rooms only, ordered by sortOrder
 * 3. Response is trimmed to the fields the visitor UI actually renders
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
        capacity: true,
        bedType: true,
        imageUrl: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: rooms,
      message: "Rooms fetched successfully.",
    });
  } catch (error) {
    console.error("[api/rooms] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the rooms. Please try again." },
      { status: 500 }
    );
  }
}
