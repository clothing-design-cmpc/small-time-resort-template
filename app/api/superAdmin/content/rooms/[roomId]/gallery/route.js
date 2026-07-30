/**
 * FILE: app/api/superAdmin/content/rooms/[roomId]/gallery/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every RoomImage for this room, in display order,
 *         for the Room Gallery sub-page (hooks/useRoomGallery.js).
 * POST -> creates a new RoomImage for this room. The actual file is
 *         already uploaded to R2 by the client beforehand (via
 *         /api/superAdmin/content/upload) — this only saves the
 *         resulting imageUrl/imageKey plus an optional caption.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";

export async function GET(request, { params }) {
  const { roomId } = await params;

  try {
    const images = await prisma.roomImage.findMany({
      where: { roomId },
      orderBy: { displayOrder: "asc" },
    });
    return NextResponse.json({ success: true, data: images, message: "Room gallery fetched successfully." });
  } catch (error) {
    console.error("[RoomGallery] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load this room's gallery. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  const { roomId } = await params;

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return NextResponse.json({ success: false, data: null, message: "Room not found." }, { status: 404 });
    }

    const body = await request.json();
    const imageUrl = body.imageUrl?.trim();
    const imageKey = body.imageKey?.trim();

    if (!imageUrl || !imageKey) {
      return NextResponse.json(
        { success: false, data: null, message: "An uploaded image is required." },
        { status: 400 }
      );
    }

    // New images go to the end of this room's display order by default.
    const lastImage = await prisma.roomImage.findFirst({
      where: { roomId },
      orderBy: { displayOrder: "desc" },
    });
    const nextDisplayOrder = (lastImage?.displayOrder ?? -1) + 1;

    const image = await prisma.roomImage.create({
      data: {
        roomId,
        imageUrl,
        imageKey,
        caption: body.caption ?? null,
        displayOrder: body.displayOrder ?? nextDisplayOrder,
        isFeatured: body.isFeatured ?? false,
      },
    });

    // Audit trail (Rule 6) — who added a gallery photo to which room.
    await logAuditEvent({
      actor: session.uid,
      action: "created",
      targetType: "RoomGalleryImage",
      targetId: image.id,
      targetName: `${room.name} — gallery image`,
      request,
      details: `Added a gallery image to room "${room.name}".`,
    });

    return NextResponse.json(
      { success: true, data: image, message: "Gallery image added successfully." },
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
