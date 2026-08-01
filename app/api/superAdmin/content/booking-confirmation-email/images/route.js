/**
 * FILE: app/api/superAdmin/content/booking-confirmation-email/images/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * POST -> creates a new booking-confirmation-email image record. The
 *         actual file is already uploaded to R2 by the client
 *         beforehand (via /api/superAdmin/content/upload, folder
 *         "booking-confirmation-email") — this only saves the
 *         resulting imageUrl/imageKey, same pattern as the Gallery
 *         images route.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";

export async function POST(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const imageUrl = body.imageUrl?.trim();
    const imageKey = body.imageKey?.trim();

    if (!imageUrl || !imageKey) {
      return NextResponse.json(
        { success: false, data: null, message: "An uploaded image is required." },
        { status: 400 }
      );
    }

    // Ensure the singleton settings row exists first — an image can't
    // be attached to a row that hasn't been created yet.
    await prisma.bookingConfirmationEmail.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });

    // New images go to the end of the display order by default.
    const lastImage = await prisma.bookingConfirmationEmailImage.findFirst({
      where: { settingsId: "singleton" },
      orderBy: { displayOrder: "desc" },
    });
    const nextDisplayOrder = (lastImage?.displayOrder ?? -1) + 1;

    const image = await prisma.bookingConfirmationEmailImage.create({
      data: {
        settingsId: "singleton",
        imageUrl,
        imageKey,
        caption: body.caption ?? null,
        displayOrder: nextDisplayOrder,
      },
    });

    await logAuditEvent({
      actor: session.uid,
      action: "created",
      targetType: "BookingConfirmationEmailImage",
      targetId: image.id,
      targetName: image.caption || "Booking confirmation email image",
      request,
      details: "Added an image to the booking confirmation email.",
    });

    return NextResponse.json({ success: true, data: image, message: "Image added successfully." });
  } catch (error) {
    console.error("[BookingConfirmationEmailImages] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't add this image. Please try again." },
      { status: 500 }
    );
  }
}
