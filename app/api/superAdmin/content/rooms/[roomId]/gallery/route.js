/**
 * FILE: app/api/superAdmin/content/rooms/[roomId]/gallery/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every RoomImage for one room, in display order, for
 *         the Room Gallery sub-page (blueprint Page 1).
 * POST -> adds a new gallery image to the room. The file itself is
 *         uploaded separately via /api/superAdmin/content/upload —
 *         this route only saves the resulting url/key/caption.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

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

    // New images are appended after whatever currently has the highest
    // displayOrder, so uploads always land at the end of the grid.
    const lastImage = await prisma.roomImage.findFirst({
      where: { roomId },
      orderBy: { displayOrder: "desc" },
    });

    const image = await prisma.roomImage.create({
      data: {
        roomId,
        imageUrl: body.imageUrl,
        imageKey: body.imageKey,
        caption: body.caption || null,
        displayOrder: (lastImage?.displayOrder ?? -1) + 1,
        isFeatured: body.isFeatured ?? false,
      },
    });

    return NextResponse.json(
      { success: true, data: image, message: "Image added to gallery successfully." },
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
