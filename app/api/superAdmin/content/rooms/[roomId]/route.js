/**
 * FILE: app/api/superAdmin/content/rooms/[roomId]/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET    -> fetch a single room for the edit form.
 * PUT    -> update a room. Re-checks slug uniqueness (excluding itself)
 *           and deletes the old R2 image if it was replaced.
 * DELETE -> deletes the room and its R2 image. Also removes this room's
 *           id from SystemSettings.featuredRoomIds if it was selected as
 *           a homepage featured room (same denormalized-array pattern as
 *           Room.amenityIds — see deep search Section 4).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { deleteFromR2 } from "@/services/r2";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";

export async function GET(request, { params }) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

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
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

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
        amenityIds: body.amenityIds ?? [],
        updatedBy: body.updatedBy || null,
      },
    });

    // The image was replaced with a new upload — remove the old R2 file
    // so the bucket never accumulates orphaned images.
    if (body.imageKey && existingRoom.imageKey && body.imageKey !== existingRoom.imageKey) {
      await deleteFromR2(existingRoom.imageKey);
    }

    // Audit trail (Rule 6) — who changed this room, and what price moved.
    // session is guaranteed non-null here since the gate above already returned early.
    await logAuditEvent({
      actor: session.uid,
      action: "updated",
      targetType: "Room",
      targetId: updatedRoom.id,
      targetName: updatedRoom.name,
      request,
      details: `Updated room "${existingRoom.name}" (₱${existingRoom.pricePerNight} → ₱${updatedRoom.pricePerNight}).`,
    });

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

    // SystemSettings.featuredRoomIds is a denormalized array of Room.id
    // values (homepage "Featured Rooms" selection) with no FK relation —
    // same pattern as Room.amenityIds (Section 4 of the deep search), so
    // it needs the same manual cleanup. Wrapped in a transaction with the
    // delete itself so a failure partway through can't leave the homepage
    // pointing at a deleted room.
    const wasFeatured = await prisma.$transaction(async (tx) => {
      const settings = await tx.systemSettings.findUnique({
        where: { id: "singleton" },
        select: { featuredRoomIds: true },
      });

      const isFeatured = settings?.featuredRoomIds?.includes(roomId) ?? false;
      if (isFeatured) {
        await tx.systemSettings.update({
          where: { id: "singleton" },
          data: { featuredRoomIds: settings.featuredRoomIds.filter((id) => id !== roomId) },
        });
      }

      await tx.room.delete({ where: { id: roomId } });

      return isFeatured;
    });

    if (room.imageKey) {
      await deleteFromR2(room.imageKey);
    }

    // Audit trail (Rule 6) — deletions are the most important action to trace.
    // session is guaranteed non-null here since the gate above already returned early.
    await logAuditEvent({
      actor: session.uid,
      action: "deleted",
      targetType: "Room",
      targetId: room.id,
      targetName: room.name,
      request,
      details: `Deleted room "${room.name}"${wasFeatured ? " (also removed from homepage featured rooms)" : ""}.`,
    });

    return NextResponse.json({ success: true, data: null, message: "Room deleted successfully." });
  } catch (error) {
    console.error("[Rooms] Failed to delete:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't delete this room. Please try again." },
      { status: 500 }
    );
  }
}
