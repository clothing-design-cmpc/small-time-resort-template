/**
 * FILE: app/api/activities/route.js
 * ROLE: Public — no auth required, called by the visitor site
 *
 * PURPOSE:
 * Read-only activity listing for visitors. This is intentionally a
 * separate endpoint from /api/superAdmin/content/activities, which is
 * the admin CRUD route protected by middleware.js. This route only
 * ever returns activities marked isActive (published) and never
 * exposes admin-only fields like imageKey or updatedBy.
 *
 * DATA FLOW:
 * 1. hooks/usePublicActivities.js calls GET /api/activities (optionally
 *    ?featured=true for the homepage preview strip)
 * 2. Query is scoped to isActive activities only, ordered by sortOrder
 * 3. Response is trimmed to the fields the visitor UI actually renders
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const featuredOnly = searchParams.get("featured") === "true";

    const activities = await prisma.activity.findMany({
      where: {
        isActive: true,
        ...(featuredOnly ? { isFeatured: true } : {}),
      },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        duration: true,
        minGroupSize: true,
        maxGroupSize: true,
        imageUrl: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: activities,
      message: "Activities fetched successfully.",
    });
  } catch (error) {
    console.error("[api/activities] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the activities. Please try again." },
      { status: 500 }
    );
  }
}
