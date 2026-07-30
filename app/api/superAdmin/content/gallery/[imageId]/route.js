/**
 * FILE: app/api/superAdmin/content/gallery/[imageId]/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * PUT    -> updates a gallery image's category, caption, display
 *           order, or featured state. Also used by the Move Up/Down
 *           actions (two PUT calls swapping displayOrder between
 *           neighbors) and Set Featured.
 * DELETE -> deletes the gallery image and its R2 file.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { deleteFromR2 } from "@/services/r2";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";

export async function PUT(request, { params }) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  const { imageId } = await params;

  try {
    const body = await request.json();

    const existingImage = await prisma.galleryImage.findUnique({ where: { id: imageId } });
    if (!existingImage) {
      return NextResponse.json({ success: false, data: null, message: "Gallery image not found." }, { status: 404 });
    }

    const updatedImage = await prisma.galleryImage.update({
      where: { id: imageId },
      data: {
        category: body.category ?? existingImage.category,
        caption: body.caption ?? existingImage.caption,
        displayOrder: body.displayOrder ?? existingImage.displayOrder,
        isFeatured: body.isFeatured ?? existingImage.isFeatured,
        updatedBy: body.updatedBy || existingImage.updatedBy,
      },
    });

    // Audit trail (Rule 6) — only log meaningful edits, not the Move Up/Down
    // reorder clicks (those only ever send { displayOrder }, which would
    // otherwise flood the log with two rows per drag).
    const isReorderOnly = Object.keys(body).every((key) => key === "displayOrder");
    if (!isReorderOnly) {
      // session is guaranteed non-null here since the gate above already returned early.
      await logAuditEvent({
        actor: session.uid,
        action: "updated",
        targetType: "GalleryImage",
        targetId: updatedImage.id,
        targetName: updatedImage.category,
        request,
        details: `Updated gallery image in category "${updatedImage.category}".`,
      });
    }

    return NextResponse.json({ success: true, data: updatedImage, message: "Gallery image updated successfully." });
  } catch (error) {
    console.error("[Gallery] Failed to update:", error);
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

  const { imageId } = await params;

  try {
    const image = await prisma.galleryImage.findUnique({ where: { id: imageId } });
    if (!image) {
      return NextResponse.json({ success: false, data: null, message: "Gallery image not found." }, { status: 404 });
    }

    await prisma.galleryImage.delete({ where: { id: imageId } });
    await deleteFromR2(image.imageKey);

    // Audit trail (Rule 6) — deletions are the most important action to trace.
    // session is guaranteed non-null here since the gate above already returned early.
    await logAuditEvent({
      actor: session.uid,
      action: "deleted",
      targetType: "GalleryImage",
      targetId: image.id,
      targetName: image.category,
      request,
      details: `Deleted a gallery image from category "${image.category}".`,
    });

    return NextResponse.json({ success: true, data: null, message: "Gallery image deleted successfully." });
  } catch (error) {
    console.error("[Gallery] Failed to delete:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't delete this image. Please try again." },
      { status: 500 }
    );
  }
}
