/**
 * FILE: app/api/superAdmin/content/booking-confirmation-email/images/[imageId]/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * PUT    -> updates an image's caption or display order (also used by
 *           the Move Up/Down actions — two PUT calls swapping
 *           displayOrder between neighbors, same pattern as Gallery).
 * DELETE -> deletes the image record and its R2 file.
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

    const existingImage = await prisma.bookingConfirmationEmailImage.findUnique({ where: { id: imageId } });
    if (!existingImage) {
      return NextResponse.json({ success: false, data: null, message: "Image not found." }, { status: 404 });
    }

    const updatedImage = await prisma.bookingConfirmationEmailImage.update({
      where: { id: imageId },
      data: {
        caption: body.caption ?? existingImage.caption,
        displayOrder: body.displayOrder ?? existingImage.displayOrder,
      },
    });

    // Audit trail (Rule 6) — skip logging Move Up/Down reorder-only clicks
    // (those only ever send { displayOrder }), same as Gallery's route.
    const isReorderOnly = Object.keys(body).every((key) => key === "displayOrder");
    if (!isReorderOnly) {
      await logAuditEvent({
        actor: session.uid,
        action: "updated",
        targetType: "BookingConfirmationEmailImage",
        targetId: updatedImage.id,
        targetName: updatedImage.caption || "Booking confirmation email image",
        request,
        details: "Updated a booking confirmation email image.",
      });
    }

    return NextResponse.json({ success: true, data: updatedImage, message: "Image updated successfully." });
  } catch (error) {
    console.error("[BookingConfirmationEmailImages] Failed to update:", error);
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
    const image = await prisma.bookingConfirmationEmailImage.findUnique({ where: { id: imageId } });
    if (!image) {
      return NextResponse.json({ success: false, data: null, message: "Image not found." }, { status: 404 });
    }

    await prisma.bookingConfirmationEmailImage.delete({ where: { id: imageId } });
    await deleteFromR2(image.imageKey);

    await logAuditEvent({
      actor: session.uid,
      action: "deleted",
      targetType: "BookingConfirmationEmailImage",
      targetId: image.id,
      targetName: image.caption || "Booking confirmation email image",
      request,
      details: "Deleted an image from the booking confirmation email.",
    });

    return NextResponse.json({ success: true, data: null, message: "Image deleted successfully." });
  } catch (error) {
    console.error("[BookingConfirmationEmailImages] Failed to delete:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't delete this image. Please try again." },
      { status: 500 }
    );
  }
}
