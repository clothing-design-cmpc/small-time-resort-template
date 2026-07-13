/**
 * FILE: app/api/superAdmin/content/amenities/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every amenity, in display order, for the Amenities
 *         Management list page (blueprint Page 9).
 * POST -> creates a new amenity. Rejects a duplicate name (case-
 *         insensitive) before saving.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET() {
  try {
    const amenities = await prisma.amenity.findMany({
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ success: true, data: amenities, message: "Amenities fetched successfully." });
  } catch (error) {
    console.error("[Amenities] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the amenities. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json(
        { success: false, data: null, message: "Amenity name is required." },
        { status: 400 }
      );
    }

    // Pre-save duplicate check (Rule 6) — case-insensitive, normalized.
    const nameTaken = await prisma.amenity.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (nameTaken) {
      return NextResponse.json(
        { success: false, data: null, message: "An amenity with this name already exists." },
        { status: 409 }
      );
    }

    // New amenities go to the end of the display order by default so
    // they don't jump ahead of existing ones on the visitor page.
    const lastAmenity = await prisma.amenity.findFirst({ orderBy: { sortOrder: "desc" } });
    const nextSortOrder = (lastAmenity?.sortOrder ?? -1) + 1;

    const amenity = await prisma.amenity.create({
      data: {
        name,
        description: body.description ?? null,
        icon: body.icon || "sparkles",
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? nextSortOrder,
      },
    });

    // Audit trail (Rule 6) — who added which amenity.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Added amenity "${amenity.name}".`,
    });

    return NextResponse.json(
      { success: true, data: amenity, message: "Amenity added successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Amenities] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't add this amenity. Please try again." },
      { status: 500 }
    );
  }
}
