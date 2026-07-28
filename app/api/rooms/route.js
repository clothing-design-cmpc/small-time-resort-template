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
    const roomSelect = {
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
    };

    let orderedRooms;

    if (featuredOnly) {
      // Try the admin's explicitly-ordered picks from Homepage Settings first.
      const homepageSettings = await prisma.systemSettings.findUnique({
        where: { id: "singleton" },
        select: { featuredRoomIds: true },
      });
      const featuredRoomIds = homepageSettings?.featuredRoomIds ?? [];

      let curatedRooms = [];
      if (featuredRoomIds.length > 0) {
        const matches = await prisma.room.findMany({
          where: { isActive: true, id: { in: featuredRoomIds } },
          select: roomSelect,
        });
        // Prisma's `id: { in: [...] }` doesn't preserve input order, so
        // re-sort to match the exact order the admin picked in.
        curatedRooms = featuredRoomIds.map((id) => matches.find((room) => room.id === id)).filter(Boolean);
      }

      if (curatedRooms.length > 0) {
        orderedRooms = curatedRooms;
      } else {
        // Curated selection is empty OR every ID it contains is stale
        // (deleted room, or a room that's since gone inactive) — either
        // way, zero real matches. Fall back to rooms individually marked
        // isFeatured on the Content > Rooms edit form (see file header),
        // capped to 3 to match the homepage's card layout.
        orderedRooms = await prisma.room.findMany({
          where: { isActive: true, isFeatured: true },
          orderBy: { sortOrder: "asc" },
          take: 3,
          select: roomSelect,
        });
      }
    } else {
      orderedRooms = await prisma.room.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: roomSelect,
      });
    }

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