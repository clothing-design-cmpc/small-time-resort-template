/**
 * FILE: app/api/superAdmin/content/rooms/[roomId]/gallery/[imageId]/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * PUT    -> updates one gallery image: caption, isFeatured toggle, or
 *           "Set as Main" (copies this image's url/key onto the parent
 *           Room row, which is what visitor-facing cards/lists use).
 * DELETE -> removes one gallery image and its R2 file.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { deleteFromR2 } from "@/services/r2";

export async function PUT(request, { params }) {
  const { roomId, imageId } = await params;

  try {
    const body = await request.json();

    const existingImage = await prisma.roomImage.findUnique({ where: { id: imageId } });
    if (!existingImage || existingImage.roomId !== roomId) {
      return NextResponse.json({ success: false, data: null, message: "Gallery image not found." }, { status: 404 });
    }

    // "Set as Main" pushes this gallery image's url/key onto the Room
    // row itself — this is a separate action from isFeatured, which
    // only affects this gallery entry.
    if (body.setAsMain) {
      await prisma.room.update({
        where: { id: roomId },
        data: { imageUrl: existingImage.imageUrl, imageKey: existingImage.imageKey },
      });
      return NextResponse.json({ success: true, data: existingImage, message: "Set as the room's main image." });
    }

    const updatedImage = await prisma.roomImage.update({
      where: { id: imageId },
      data: {
        caption: body.caption ?? existingImage.caption,
        isFeatured: body.isFeatured ?? existingImage.isFeatured,
      },
    });

    return NextResponse.json({ success: true, data: updatedImage, message: "Gallery image updated successfully." });
  } catch (error) {
    console.error("[RoomGallery] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save this change. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const { roomId, imageId } = await params;

  try {
    const image = await prisma.roomImage.findUnique({ where: { id: imageId } });
    if (!image || image.roomId !== roomId) {
      return NextResponse.json({ success: false, data: null, message: "Gallery image not found." }, { status: 404 });
    }

    await prisma.roomImage.delete({ where: { id: imageId } });

    if (image.imageKey) {
      await deleteFromR2(image.imageKey);
    }

    return NextResponse.json({ success: true, data: null, message: "Gallery image deleted successfully." });
  } catch (error) {
    console.error("[RoomGallery] Failed to delete:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't delete this image. Please try again." },
      { status: 500 }
    );
  }
}
