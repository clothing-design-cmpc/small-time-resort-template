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
 * ?featured=true reads SystemSettings.featuredRoomIds — the up-to-3,
 * admin-ordered picker on the Homepage Settings page (Section 2:
 * "Featured Rooms") — NOT Room.isFeatured. Those are two separate
 * fields: Room.isFeatured is a per-room checkbox on the Content > Rooms
 * edit form used elsewhere (e.g. the admin Rooms list "Featured"
 * column), while SystemSettings.featuredRoomIds is the dedicated,
 * capped, explicitly-ordered selection meant specifically for this
 * homepage section. Previously this route filtered by Room.isFeatured
 * instead, so whatever the admin picked on the Homepage Settings page
 * had no effect at all on what the homepage actually showed — the
 * checkboxes there were silently disconnected from the real output.
 * Results are returned in the SAME order the admin picked them in
 * (the order they appear in featuredRoomIds), not room sortOrder.
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

    // Featured requests need the admin's chosen room IDs (and their
    // order) from the Homepage Settings singleton before the room
    // query itself can be scoped correctly.
    let featuredRoomIds = [];
    if (featuredOnly) {
      const homepageSettings = await prisma.systemSettings.findUnique({
        where: { id: "singleton" },
        select: { featuredRoomIds: true },
      });
      featuredRoomIds = homepageSettings?.featuredRoomIds ?? [];

      // Nothing picked yet — return early with an empty list rather
      // than falling through to "all active rooms," which would show
      // an unintended, unordered set instead of the empty state the
      // homepage component already handles gracefully.
      if (featuredRoomIds.length === 0) {
        return NextResponse.json({ success: true, data: [], message: "Rooms fetched successfully." });
      }
    }

    const rooms = await prisma.room.findMany({
      where: {
        isActive: true,
        ...(featuredOnly ? { id: { in: featuredRoomIds } } : {}),
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
    const orderedRooms = featuredOnly
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
