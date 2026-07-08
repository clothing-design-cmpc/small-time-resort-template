/**
 * FILE: app/api/superAdmin/content/amenities/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every amenity, in display order, for the Amenities
 *         Management list page.
 * POST -> creates a new amenity. Name is checked for uniqueness before
 *         insert (Rule 6 — pre-save duplicate check) since two
 *         identically-named amenities would confuse the room-edit
 *         multi-select checkboxes.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

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

    // Normalize the name before the duplicate check so casing/whitespace
    // differences never slip past it (Rule 6 — field normalization).
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json(
        { success: false, data: null, message: "Amenity name is required." },
        { status: 400 }
      );
    }

    // Pre-save duplicate check — never rely on a DB unique constraint alone.
    const existingAmenity = await prisma.amenity.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existingAmenity) {
      return NextResponse.json(
        { success: false, data: null, message: "An amenity with this name already exists." },
        { status: 409 }
      );
    }

    const amenity = await prisma.amenity.create({
      data: {
        name,
        description: body.description || null,
        icon: body.icon || "sparkles",
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
    });

    return NextResponse.json(
      { success: true, data: amenity, message: "Amenity created successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Amenities] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't create the amenity. Please try again." },
      { status: 500 }
    );
  }
}
