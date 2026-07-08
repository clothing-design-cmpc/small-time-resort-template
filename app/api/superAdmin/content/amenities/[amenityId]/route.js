/**
 * FILE: app/api/superAdmin/content/amenities/[amenityId]/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * PUT    -> updates an amenity. Re-checks name uniqueness (excluding
 *           itself) before saving.
 * DELETE -> deletes the amenity outright. Amenities have no R2 image
 *           to clean up (icon is a Lucide name, not an uploaded file).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

export async function PUT(request, { params }) {
  const { amenityId } = await params;

  try {
    const body = await request.json();
    const name = body.name?.trim();

    const existingAmenity = await prisma.amenity.findUnique({ where: { id: amenityId } });
    if (!existingAmenity) {
      return NextResponse.json({ success: false, data: null, message: "Amenity not found." }, { status: 404 });
    }

    if (!name) {
      return NextResponse.json(
        { success: false, data: null, message: "Amenity name is required." },
        { status: 400 }
      );
    }

    // Duplicate check excludes this amenity's own current name.
    if (name.toLowerCase() !== existingAmenity.name.toLowerCase()) {
      const nameTaken = await prisma.amenity.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });
      if (nameTaken) {
        return NextResponse.json(
          { success: false, data: null, message: "An amenity with this name already exists." },
          { status: 409 }
        );
      }
    }

    const updatedAmenity = await prisma.amenity.update({
      where: { id: amenityId },
      data: {
        name,
        description: body.description ?? null,
        icon: body.icon || existingAmenity.icon,
        isActive: body.isActive ?? existingAmenity.isActive,
        sortOrder: body.sortOrder ?? existingAmenity.sortOrder,
      },
    });

    return NextResponse.json({ success: true, data: updatedAmenity, message: "Amenity updated successfully." });
  } catch (error) {
    console.error("[Amenities] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save the changes. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const { amenityId } = await params;

  try {
    const amenity = await prisma.amenity.findUnique({ where: { id: amenityId } });
    if (!amenity) {
      return NextResponse.json({ success: false, data: null, message: "Amenity not found." }, { status: 404 });
    }

    await prisma.amenity.delete({ where: { id: amenityId } });

    return NextResponse.json({ success: true, data: null, message: "Amenity deleted successfully." });
  } catch (error) {
    console.error("[Amenities] Failed to delete:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't delete this amenity. Please try again." },
      { status: 500 }
    );
  }
}
