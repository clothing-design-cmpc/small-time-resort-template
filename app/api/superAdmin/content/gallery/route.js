/**
 * FILE: app/api/superAdmin/content/gallery/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every gallery image, in display order, for the
 *         Gallery Management list page.
 * POST -> creates a new gallery image record. The actual file is
 *         already uploaded to R2 by the client beforehand (via
 *         /api/superAdmin/content/upload) — this only saves the
 *         resulting imageUrl/imageKey plus category/caption.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";

export async function GET() {
  try {
    const galleryImages = await prisma.galleryImage.findMany({
      orderBy: { displayOrder: "asc" },
    });
    return NextResponse.json({ success: true, data: galleryImages, message: "Gallery images fetched successfully." });
  } catch (error) {
    console.error("[Gallery] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the gallery. Please try again." },
      { status: 500 }
    );
  }
}

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

    // New images go to the end of the display order by default so they
    // don't jump ahead of existing ones on the visitor page.
    const lastImage = await prisma.galleryImage.findFirst({ orderBy: { displayOrder: "desc" } });
    const nextDisplayOrder = (lastImage?.displayOrder ?? -1) + 1;

    const galleryImage = await prisma.galleryImage.create({
      data: {
        category: body.category || "common_area",
        imageUrl,
        imageKey,
        caption: body.caption ?? null,
        displayOrder: body.displayOrder ?? nextDisplayOrder,
        isFeatured: body.isFeatured ?? false,
        updatedBy: body.updatedBy || null,
      },
    });

    // Audit trail (Rule 6) — who added which gallery image.
    await logAuditEvent({
      actor: session.uid,
      action: "created",
      targetType: "GalleryImage",
      targetId: galleryImage.id,
      targetName: galleryImage.category,
      request,
      details: `Added a gallery image to category "${galleryImage.category}".`,
    });

    return NextResponse.json(
      { success: true, data: galleryImage, message: "Gallery image added successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Gallery] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't add this image. Please try again." },
      { status: 500 }
    );
  }
}
