/**
 * FILE: app/api/superAdmin/content/testimonials/[testimonialId]/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * PUT    -> updates a testimonial. Deletes the old R2 guest photo if
 *           it was replaced with a new upload.
 * DELETE -> deletes the testimonial and its R2 guest photo (if any).
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

  const { testimonialId } = await params;

  try {
    const body = await request.json();
    const guestName = body.guestName?.trim();

    const existingTestimonial = await prisma.testimonial.findUnique({ where: { id: testimonialId } });
    if (!existingTestimonial) {
      return NextResponse.json({ success: false, data: null, message: "Testimonial not found." }, { status: 404 });
    }

    if (!guestName) {
      return NextResponse.json(
        { success: false, data: null, message: "Guest name is required." },
        { status: 400 }
      );
    }

    const updatedTestimonial = await prisma.testimonial.update({
      where: { id: testimonialId },
      data: {
        guestName,
        guestPhoto: body.guestPhoto ?? existingTestimonial.guestPhoto,
        guestPhotoKey: body.guestPhotoKey ?? existingTestimonial.guestPhotoKey,
        rating: body.rating ?? existingTestimonial.rating,
        quote: (body.quote ?? existingTestimonial.quote).slice(0, 500),
        isFeatured: body.isFeatured ?? existingTestimonial.isFeatured,
        displayOrder: body.displayOrder ?? existingTestimonial.displayOrder,
        updatedBy: body.updatedBy || existingTestimonial.updatedBy,
      },
    });

    // The photo was replaced with a new upload — remove the old R2 file
    // so the bucket never accumulates orphaned images.
    if (body.guestPhotoKey && existingTestimonial.guestPhotoKey && body.guestPhotoKey !== existingTestimonial.guestPhotoKey) {
      await deleteFromR2(existingTestimonial.guestPhotoKey);
    }

    // Audit trail (Rule 6) — track testimonial edits.
    // session is guaranteed non-null here since the gate above already returned early.
    await logAuditEvent({
      actor: session.uid,
      action: "updated",
      targetType: "Testimonial",
      targetId: updatedTestimonial.id,
      targetName: updatedTestimonial.guestName,
      request,
      details: `Updated testimonial from "${existingTestimonial.guestName}".`,
    });

    return NextResponse.json({ success: true, data: updatedTestimonial, message: "Testimonial updated successfully." });
  } catch (error) {
    console.error("[Testimonials] Failed to update:", error);
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

  const { testimonialId } = await params;

  try {
    const testimonial = await prisma.testimonial.findUnique({ where: { id: testimonialId } });
    if (!testimonial) {
      return NextResponse.json({ success: false, data: null, message: "Testimonial not found." }, { status: 404 });
    }

    await prisma.testimonial.delete({ where: { id: testimonialId } });

    // Clean up the guest photo from R2, if one was uploaded.
    if (testimonial.guestPhotoKey) {
      await deleteFromR2(testimonial.guestPhotoKey);
    }

    // Audit trail (Rule 6) — deletions are the most important action to trace.
    // session is guaranteed non-null here since the gate above already returned early.
    await logAuditEvent({
      actor: session.uid,
      action: "deleted",
      targetType: "Testimonial",
      targetId: testimonial.id,
      targetName: testimonial.guestName,
      request,
      details: `Deleted testimonial from "${testimonial.guestName}".`,
    });

    return NextResponse.json({ success: true, data: null, message: "Testimonial deleted successfully." });
  } catch (error) {
    console.error("[Testimonials] Failed to delete:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't delete this testimonial. Please try again." },
      { status: 500 }
    );
  }
}
