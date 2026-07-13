/**
 * FILE: app/api/superAdmin/content/rooms/[roomId]/gallery/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every RoomImage for this room, in display order, for
 *         the Room Gallery sub-page.
 * POST -> creates a new RoomImage record. The file itself is already
 *         uploaded to R2 by the caller via the shared upload endpoint —
 *         this just saves the resulting url/key + metadata.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET(request, { params }) {
  const { roomId } = await params;

  try {
    const roomImages = await prisma.roomImage.findMany({
      where: { roomId },
      orderBy: { displayOrder: "asc" },
    });
    return NextResponse.json({ success: true, data: roomImages, message: "Gallery images fetched successfully." });
  } catch (error) {
    console.error("[RoomGallery] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load this room's gallery. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  const { roomId } = await params;

  try {
    const body = await request.json();

    if (!body.imageUrl || !body.imageKey) {
      return NextResponse.json(
        { success: false, data: null, message: "An uploaded image is required." },
        { status: 400 }
      );
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return NextResponse.json({ success: false, data: null, message: "Room not found." }, { status: 404 });
    }

    // New images go to the end of this room's display order so they
    // don't jump ahead of existing gallery photos.
    const lastImageInRoom = await prisma.roomImage.findFirst({
      where: { roomId },
      orderBy: { displayOrder: "desc" },
    });
    const nextDisplayOrder = (lastImageInRoom?.displayOrder ?? -1) + 1;

    const roomImage = await prisma.roomImage.create({
      data: {
        roomId,
        imageUrl: body.imageUrl,
        imageKey: body.imageKey,
        caption: body.caption ?? null,
        displayOrder: body.displayOrder ?? nextDisplayOrder,
        isFeatured: body.isFeatured ?? false,
      },
    });

    // Audit trail (Rule 6) — who added a photo to which room's gallery.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Added a gallery image to room "${room.name}".`,
    });

    return NextResponse.json(
      { success: true, data: roomImage, message: "Gallery image added successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[RoomGallery] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't add this image. Please try again." },
      { status: 500 }
    );
  }
}
