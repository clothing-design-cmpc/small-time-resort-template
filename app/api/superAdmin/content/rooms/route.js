/**
 * FILE: app/api/superAdmin/content/rooms/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every room, newest first, for the Rooms Management
 *         list page.
 * POST -> creates a new room. slug is checked for uniqueness before
 *         insert (Rule 6 — pre-save duplicate check) since the DB
 *         unique constraint alone would surface as an unfriendly 500.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET() {
  try {
    const rooms = await prisma.room.findMany({
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ success: true, data: rooms, message: "Rooms fetched successfully." });
  } catch (error) {
    console.error("[Rooms] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the rooms. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Normalize the slug before the duplicate check so casing/whitespace
    // differences never slip past it (Rule 6 — field normalization).
    const slug = body.slug?.trim().toLowerCase();

    if (!body.name || !slug || body.pricePerNight == null) {
      return NextResponse.json(
        { success: false, data: null, message: "Room name, slug, and price are required." },
        { status: 400 }
      );
    }

    // Pre-save duplicate check — never rely on the DB unique constraint alone.
    const existingRoom = await prisma.room.findUnique({ where: { slug } });
    if (existingRoom) {
      return NextResponse.json(
        { success: false, data: null, message: "A room with this slug already exists." },
        { status: 409 }
      );
    }

    const room = await prisma.room.create({
      data: {
        name: body.name,
        slug,
        description: body.description || null,
        pricePerNight: body.pricePerNight,
        capacity: body.capacity ?? 2,
        bedType: body.bedType || "King",
        imageUrl: body.imageUrl || null,
        imageKey: body.imageKey || null,
        isActive: body.isActive ?? true,
        isFeatured: body.isFeatured ?? false,
        sortOrder: body.sortOrder ?? 0,
        amenityIds: body.amenityIds ?? [],
        updatedBy: body.updatedBy || null,
      },
    });

    // Audit trail (Rule 6) — who created which room, and when.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Created room "${room.name}" (₱${room.pricePerNight}/night).`,
    });

    return NextResponse.json({ success: true, data: room, message: "Room created successfully." }, { status: 201 });
  } catch (error) {
    console.error("[Rooms] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't create the room. Please try again." },
      { status: 500 }
    );
  }
}
