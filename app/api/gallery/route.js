/**
 * FILE: app/api/gallery/route.js
 * ROLE: Public — no auth required, called by the visitor site
 *
 * PURPOSE:
 * Read-only gallery image listing for visitors. This is intentionally a
 * separate endpoint from /api/superAdmin/content/gallery, which is the
 * admin CRUD route protected by middleware.js. This route never exposes
 * admin-only fields like imageKey or updatedBy.
 *
 * DATA FLOW:
 * 1. hooks/usePublicGallery.js calls GET /api/gallery (optionally
 *    ?featured=true for the homepage preview strip)
 * 2. Ordered by category then displayOrder
 * 3. Response is trimmed to the fields the visitor UI actually renders
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const featuredOnly = searchParams.get("featured") === "true";

    const images = await prisma.galleryImage.findMany({
      where: featuredOnly ? { isFeatured: true } : {},
      orderBy: [{ category: "asc" }, { displayOrder: "asc" }],
      select: {
        id: true,
        category: true,
        imageUrl: true,
        caption: true,
        isFeatured: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: images,
      message: "Gallery images fetched successfully.",
    });
  } catch (error) {
    console.error("[api/gallery] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the gallery. Please try again." },
      { status: 500 }
    );
  }
}
