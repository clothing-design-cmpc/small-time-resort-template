/**
 * FILE: app/api/superAdmin/content/activities/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every activity for the Activities Management list page.
 * POST -> creates a new activity. Name is checked for uniqueness before
 *         insert (Rule 6 — pre-save duplicate check).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

export async function GET() {
  try {
    const activities = await prisma.activity.findMany({
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ success: true, data: activities, message: "Activities fetched successfully." });
  } catch (error) {
    console.error("[Activities] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the activities. Please try again." },
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
        { success: false, data: null, message: "Activity name is required." },
        { status: 400 }
      );
    }

    // Pre-save duplicate check — never rely on the DB unique constraint alone.
    const existingActivity = await prisma.activity.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existingActivity) {
      return NextResponse.json(
        { success: false, data: null, message: "An activity with this name already exists." },
        { status: 409 }
      );
    }

    const activity = await prisma.activity.create({
      data: {
        name,
        description: body.description || null,
        duration: body.duration || null,
        minGroupSize: body.minGroupSize ?? 1,
        maxGroupSize: body.maxGroupSize ?? 10,
        imageUrl: body.imageUrl || null,
        imageKey: body.imageKey || null,
        isFeatured: body.isFeatured ?? false,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
    });

    return NextResponse.json(
      { success: true, data: activity, message: "Activity created successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Activities] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't create the activity. Please try again." },
      { status: 500 }
    );
  }
}
