/**
 * FILE: app/api/superAdmin/content/activities/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every activity, in display order, for the
 *         Activities Management list page (blueprint Page 11).
 * POST -> creates a new activity. Rejects a duplicate name (case-
 *         insensitive) before saving.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

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

    // Pre-save duplicate check (Rule 6) — case-insensitive, normalized.
    const nameTaken = await prisma.activity.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (nameTaken) {
      return NextResponse.json(
        { success: false, data: null, message: "An activity with this name already exists." },
        { status: 409 }
      );
    }

    // New activities go to the end of the display order by default so
    // they don't jump ahead of existing ones on the visitor page.
    const lastActivity = await prisma.activity.findFirst({ orderBy: { sortOrder: "desc" } });
    const nextSortOrder = (lastActivity?.sortOrder ?? -1) + 1;

    const activity = await prisma.activity.create({
      data: {
        name,
        description: body.description ?? null,
        duration: body.duration ?? "",
        minGroupSize: body.minGroupSize ?? 1,
        maxGroupSize: body.maxGroupSize ?? 10,
        imageUrl: body.imageUrl ?? null,
        imageKey: body.imageKey ?? null,
        isActive: body.isActive ?? true,
        isFeatured: body.isFeatured ?? false,
        sortOrder: body.sortOrder ?? nextSortOrder,
        updatedBy: body.updatedBy || null,
      },
    });

    // Audit trail (Rule 6) — who added which activity.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Added activity "${activity.name}".`,
    });

    return NextResponse.json(
      { success: true, data: activity, message: "Activity added successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Activities] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't add this activity. Please try again." },
      { status: 500 }
    );
  }
}
