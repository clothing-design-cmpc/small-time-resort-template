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
 * FEATURED SELECTION SOURCE OF TRUTH:
 * ?featured=true prefers SystemSettings.featuredRoomIds — the up-to-3,
 * admin-ordered picker on the Homepage Settings page (Section 2:
 * "Featured Rooms") — since that's an explicit, deliberately-ordered
 * curation. If that picker is empty (nothing chosen there yet), it
 * FALLS BACK to Room.isFeatured — the per-room "Featured on homepage"
 * checkbox on the Content > Rooms edit form, whose own hint text
 * promises "Featured rooms appear in the homepage highlights."
 * Previously that checkbox was completely disconnected from this
 * route (it only ever read featuredRoomIds), so checking it on a room
 * silently did nothing — a misleading dead control. The fallback is
 * capped to 3 rooms (sortOrder) to match the homepage's card layout.
 * Whichever source is used, that source also controls the order:
 * featuredRoomIds order when present, otherwise sortOrder.
 *
 * DATA FLOW:
 * 1. hooks/usePublicRooms.js calls GET /api/rooms (optionally
 *    ?featured=true for the homepage's featured selection)
 * 2. Query is scoped to isActive rooms only; featured requests are
 *    additionally scoped to SystemSettings.featuredRoomIds and
 *    re-ordered to match that array
 * 3. Response is trimmed to the fields the visitor UI actually renders,
 *    including the roomImages gallery relation (id/url/caption only —
 *    never imageKey, which is R2-internal/admin-only) so room cards can
 *    show a photo-count badge (superadmin-audit-followup.txt Priority 2
 *    item 4 — this relation was previously never selected here, so the
 *    per-room gallery the admin manages never reached the visitor site)
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const featuredOnly = searchParams.get("featured") === "true";

    // Featured requests prefer the admin's explicitly-ordered picks
    // from the Homepage Settings singleton. If none have been chosen
    // there yet, fall back to rooms individually marked isFeatured on
    // the Content > Rooms edit form — see file header for why.
    let featuredRoomIds = [];
    let useIsFeaturedFallback = false;
    if (featuredOnly) {
      const homepageSettings = await prisma.systemSettings.findUnique({
        where: { id: "singleton" },
        select: { featuredRoomIds: true },
      });
      featuredRoomIds = homepageSettings?.featuredRoomIds ?? [];
      useIsFeaturedFallback = featuredRoomIds.length === 0;
    }

    const rooms = await prisma.room.findMany({
      where: {
        isActive: true,
        ...(featuredOnly && !useIsFeaturedFallback ? { id: { in: featuredRoomIds } } : {}),
        ...(featuredOnly && useIsFeaturedFallback ? { isFeatured: true } : {}),
      },
      orderBy: { sortOrder: "asc" },
      // Homepage only ever shows 3 cards — cap the fallback the same
      // way the explicit picker already caps itself at selection time.
      ...(featuredOnly && useIsFeaturedFallback ? { take: 3 } : {}),
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        pricePerNight: true,
        capacity: true,
        bedType: true,
        imageUrl: true,
        roomImages: {
          orderBy: { displayOrder: "asc" },
          select: { id: true, imageUrl: true, caption: true, isFeatured: true },
        },
      },
    });

    // Prisma's `id: { in: [...] }` does not preserve the input array's
    // order, so re-sort to match the exact order the admin picked the
    // rooms in on the Homepage Settings page — that ordering is the
    // whole point of a manually curated (vs. auto sortOrder) selection.
    // Not applicable to the isFeatured fallback path — that one is
    // already correctly ordered by sortOrder straight from the query.
    const orderedRooms = featuredOnly && !useIsFeaturedFallback
      ? featuredRoomIds
          .map((roomId) => rooms.find((room) => room.id === roomId))
          .filter(Boolean)
      : rooms;

    return NextResponse.json({
      success: true,
      data: orderedRooms,
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