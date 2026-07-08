/**
 * FILE: app/api/superAdmin/content/rooms/[roomId]/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET    -> fetch a single room for the edit form.
 * PUT    -> update a room. Re-checks slug uniqueness (excluding itself)
 *           and deletes the old R2 image if it was replaced.
 * DELETE -> deletes the room and its R2 image.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { deleteFromR2 } from "@/services/r2";

export async function GET(request, { params }) {
  const { roomId } = await params;

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId } });

    if (!room) {
      return NextResponse.json({ success: false, data: null, message: "Room not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: room, message: "Room fetched successfully." });
  } catch (error) {
    console.error("[Rooms] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load this room. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  const { roomId } = await params;

  try {
    const body = await request.json();
    const slug = body.slug?.trim().toLowerCase();

    const existingRoom = await prisma.room.findUnique({ where: { id: roomId } });
    if (!existingRoom) {
      return NextResponse.json({ success: false, data: null, message: "Room not found." }, { status: 404 });
    }

    // Duplicate check excludes this room's own current slug.
    if (slug && slug !== existingRoom.slug) {
      const slugTaken = await prisma.room.findUnique({ where: { slug } });
      if (slugTaken) {
        return NextResponse.json(
          { success: false, data: null, message: "A room with this slug already exists." },
          { status: 409 }
        );
      }
    }

    const updatedRoom = await prisma.room.update({
      where: { id: roomId },
      data: {
        name: body.name,
        slug: slug || existingRoom.slug,
        description: body.description ?? null,
        pricePerNight: body.pricePerNight,
        capacity: body.capacity,
        bedType: body.bedType,
        imageUrl: body.imageUrl ?? existingRoom.imageUrl,
        imageKey: body.imageKey ?? existingRoom.imageKey,
        isActive: body.isActive,
        isFeatured: body.isFeatured,
        sortOrder: body.sortOrder,
        minNightsPerBooking: body.minNightsPerBooking,
        maxNightsPerBooking: body.maxNightsPerBooking,
        minGuestsAllowed: body.minGuestsAllowed,
        amenityIds: body.amenityIds ?? [],
        updatedBy: body.updatedBy || null,
      },
    });

    // The image was replaced with a new upload — remove the old R2 file
    // so the bucket never accumulates orphaned images.
    if (body.imageKey && existingRoom.imageKey && body.imageKey !== existingRoom.imageKey) {
      await deleteFromR2(existingRoom.imageKey);
    }

    return NextResponse.json({ success: true, data: updatedRoom, message: "Room updated successfully." });
  } catch (error) {
    console.error("[Rooms] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save the changes. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const { roomId } = await params;

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return NextResponse.json({ success: false, data: null, message: "Room not found." }, { status: 404 });
    }

    await prisma.room.delete({ where: { id: roomId } });

    if (room.imageKey) {
      await deleteFromR2(room.imageKey);
    }

    return NextResponse.json({ success: true, data: null, message: "Room deleted successfully." });
  } catch (error) {
    console.error("[Rooms] Failed to delete:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't delete this room. Please try again." },
      { status: 500 }
    );
  }
}
