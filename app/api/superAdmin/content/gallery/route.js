/**
 * FILE: app/api/superAdmin/content/gallery/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every gallery image, ordered by category then
 *         displayOrder, for the Gallery Management grid.
 * POST -> creates a new GalleryImage row from the already-uploaded
 *         R2 key/URL the client sends (the file itself lands in R2
 *         via /api/superAdmin/content/upload before this call runs).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

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
  // Auth gate runs before any database write (Rule 1 — no independent auth
  // gate before mutation). This is a second, independent enforcement point
  // in case proxy.js's outer layer ever fails open or is misconfigured.
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    // The file itself already landed in R2 via the shared upload endpoint —
    // this call only ever creates the DB row pointing at it.
    if (!body.imageUrl || !body.imageKey) {
      return NextResponse.json(
        { success: false, data: null, message: "An uploaded image is required." },
        { status: 400 }
      );
    }

    const galleryImage = await prisma.galleryImage.create({
      data: {
        category: body.category || "common_area",
        imageUrl: body.imageUrl,
        imageKey: body.imageKey,
        caption: body.caption || null,
        displayOrder: body.displayOrder ?? 0,
        isFeatured: body.isFeatured ?? false,
        updatedBy: body.updatedBy || null,
      },
    });

    // Audit trail (Rule 6) — who uploaded which image, and when.
    // session is guaranteed non-null here since the gate above already returned early.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Uploaded a gallery image to category "${galleryImage.category}".`,
    });

    return NextResponse.json(
      { success: true, data: galleryImage, message: "Gallery image created successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Gallery] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save this image. Please try again." },
      { status: 500 }
    );
  }
}
