/**
 * FILE: app/api/superAdmin/content/gallery/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every gallery image, in display order, for the
 *         Gallery Management page (blueprint Page 6).
 * POST -> creates a new gallery image record. The file itself is
 *         already uploaded to R2 by the caller via the shared upload
 *         endpoint — this just saves the resulting url/key + metadata.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET() {
  try {
    const galleryImages = await prisma.galleryImage.findMany({
      orderBy: [{ category: "asc" }, { displayOrder: "asc" }],
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
  try {
    const body = await request.json();

    if (!body.imageUrl || !body.imageKey) {
      return NextResponse.json(
        { success: false, data: null, message: "An uploaded image is required." },
        { status: 400 }
      );
    }

    const category = body.category || "common_area";

    // New images go to the end of the display order within their own
    // category so they don't jump ahead of existing ones on that tab.
    const lastImageInCategory = await prisma.galleryImage.findFirst({
      where: { category },
      orderBy: { displayOrder: "desc" },
    });
    const nextDisplayOrder = (lastImageInCategory?.displayOrder ?? -1) + 1;

    const galleryImage = await prisma.galleryImage.create({
      data: {
        category,
        imageUrl: body.imageUrl,
        imageKey: body.imageKey,
        caption: body.caption ?? null,
        displayOrder: body.displayOrder ?? nextDisplayOrder,
        isFeatured: body.isFeatured ?? false,
        updatedBy: body.updatedBy || null,
      },
    });

    // Audit trail (Rule 6) — who added an image to which category.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
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
