/**
 * FILE: app/api/superAdmin/content/activities/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every activity, ordered by sortOrder, for the
 *         Activities Management list page.
 * POST -> creates a new activity. Name is checked for uniqueness
 *         before insert (Rule 6 — pre-save duplicate check), same
 *         pattern the [activityId] PUT handler already uses.
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

    // Normalize the name before the duplicate check so casing/whitespace
    // differences never slip past it (Rule 6 — field normalization).
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json(
        { success: false, data: null, message: "Activity name is required." },
        { status: 400 }
      );
    }

    // Pre-save duplicate check — never rely on the DB unique constraint alone.
    const nameTaken = await prisma.activity.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (nameTaken) {
      return NextResponse.json(
        { success: false, data: null, message: "An activity with this name already exists." },
        { status: 409 }
      );
    }

    const activity = await prisma.activity.create({
      data: {
        name,
        description: body.description || null,
        duration: body.duration || "",
        minGroupSize: body.minGroupSize ?? 1,
        maxGroupSize: body.maxGroupSize ?? 10,
        imageUrl: body.imageUrl || null,
        imageKey: body.imageKey || null,
        isActive: body.isActive ?? true,
        isFeatured: body.isFeatured ?? false,
        sortOrder: body.sortOrder ?? 0,
        updatedBy: session.uid,
      },
    });

    // Audit trail (Rule 6) — who created which activity, and when.
    // session is guaranteed non-null here since the gate above already returned early.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Created activity "${activity.name}".`,
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
