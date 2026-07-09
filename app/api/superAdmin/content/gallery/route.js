/**
 * FILE: app/api/superAdmin/content/gallery/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every gallery image, in display order, for the
 *         Gallery Management grid (blueprint Page 6). The client
 *         filters by category tab locally — this always returns the
 *         full set so switching tabs never re-fetches.
 * POST -> creates a new gallery image. imageUrl/imageKey must already
 *         come from a completed upload to /api/superAdmin/content/upload.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

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
  try {
    const body = await request.json();

    if (!body.imageUrl || !body.imageKey) {
      return NextResponse.json(
        { success: false, data: null, message: "An image upload is required." },
        { status: 400 }
      );
    }

    // New images go to the end of their category's display order by
    // default so they appear after existing images in that tab.
    const lastInCategory = await prisma.galleryImage.findFirst({
      where: { category: body.category || "common_area" },
      orderBy: { displayOrder: "desc" },
    });
    const nextDisplayOrder = (lastInCategory?.displayOrder ?? -1) + 1;

    const galleryImage = await prisma.galleryImage.create({
      data: {
        category: body.category || "common_area",
        imageUrl: body.imageUrl,
        imageKey: body.imageKey,
        caption: body.caption || null,
        displayOrder: body.displayOrder ?? nextDisplayOrder,
        isFeatured: body.isFeatured ?? false,
        updatedBy: body.updatedBy || null,
      },
    });

    return NextResponse.json(
      { success: true, data: galleryImage, message: "Image uploaded to the gallery successfully." },
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
