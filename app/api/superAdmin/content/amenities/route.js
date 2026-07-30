/**
 * FILE: app/api/superAdmin/content/amenities/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every amenity, ordered by sortOrder, for the
 *         Amenities Management list page.
 * POST -> creates a new amenity. New amenities are appended to the
 *         end of the sort order by default.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";

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
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json(
        { success: false, data: null, message: "Amenity name is required." },
        { status: 400 }
      );
    }

    // Duplicate check — amenity names must be unique (case-insensitive),
    // mirroring the same check the PUT handler runs on rename.
    const nameTaken = await prisma.amenity.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (nameTaken) {
      return NextResponse.json(
        { success: false, data: null, message: "An amenity with this name already exists." },
        { status: 409 }
      );
    }

    // New amenities go to the end of the sort order by default so they
    // don't jump ahead of existing ones on the visitor page.
    const lastAmenity = await prisma.amenity.findFirst({ orderBy: { sortOrder: "desc" } });
    const nextSortOrder = (lastAmenity?.sortOrder ?? -1) + 1;

    const amenity = await prisma.amenity.create({
      data: {
        name,
        description: body.description ?? null,
        icon: body.icon || null,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? nextSortOrder,
      },
    });

    // Audit trail (Rule 6) — who added which amenity.
    await logAuditEvent({
      actor: session.uid,
      action: "created",
      targetType: "Amenity",
      targetId: amenity.id,
      targetName: amenity.name,
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
