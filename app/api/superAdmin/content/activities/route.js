/**
 * FILE: app/api/superAdmin/content/activities/[activityId]/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET    -> fetch a single activity for the edit form.
 * PUT    -> update an activity. Re-checks name uniqueness (excluding
 *           itself) and deletes the old R2 image if it was replaced.
 * DELETE -> deletes the activity and its R2 image.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { deleteFromR2 } from "@/services/r2";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET(request, { params }) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

  const { activityId } = await params;

  try {
    const activity = await prisma.activity.findUnique({ where: { id: activityId } });

    if (!activity) {
      return NextResponse.json({ success: false, data: null, message: "Activity not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: activity, message: "Activity fetched successfully." });
  } catch (error) {
    console.error("[Activities] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load this activity. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  const { activityId } = await params;

  try {
    const body = await request.json();
    const name = body.name?.trim();

    const existingActivity = await prisma.activity.findUnique({ where: { id: activityId } });
    if (!existingActivity) {
      return NextResponse.json({ success: false, data: null, message: "Activity not found." }, { status: 404 });
    }

    // Duplicate check excludes this activity's own current name.
    if (name && name.toLowerCase() !== existingActivity.name.toLowerCase()) {
      const nameTaken = await prisma.activity.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, NOT: { id: activityId } },
      });
      if (nameTaken) {
        return NextResponse.json(
          { success: false, data: null, message: "An activity with this name already exists." },
          { status: 409 }
        );
      }
    }

    const updatedActivity = await prisma.activity.update({
      where: { id: activityId },
      data: {
        name: name || existingActivity.name,
        description: body.description ?? null,
        duration: body.duration ?? null,
        minGroupSize: body.minGroupSize,
        maxGroupSize: body.maxGroupSize,
        imageUrl: body.imageUrl ?? existingActivity.imageUrl,
        imageKey: body.imageKey ?? existingActivity.imageKey,
        isFeatured: body.isFeatured,
        isActive: body.isActive,
        sortOrder: body.sortOrder ?? existingActivity.sortOrder,
      },
    });

    // The image was replaced with a new upload — remove the old R2 file
    // so the bucket never accumulates orphaned images.
    if (body.imageKey && existingActivity.imageKey && body.imageKey !== existingActivity.imageKey) {
      await deleteFromR2(existingActivity.imageKey);
    }

    // Audit trail (Rule 6) — track activity edits, including renames.
    // session is guaranteed non-null here since the gate above already returned early.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Updated activity "${existingActivity.name}"${updatedActivity.name !== existingActivity.name ? ` → "${updatedActivity.name}"` : ""}.`,
    });

    return NextResponse.json({ success: true, data: updatedActivity, message: "Activity updated successfully." });
  } catch (error) {
    console.error("[Activities] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save the changes. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  const { activityId } = await params;

  try {
    const activity = await prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity) {
      return NextResponse.json({ success: false, data: null, message: "Activity not found." }, { status: 404 });
    }

    await prisma.activity.delete({ where: { id: activityId } });

    if (activity.imageKey) {
      await deleteFromR2(activity.imageKey);
    }

    // Audit trail (Rule 6) — deletions are the most important action to trace.
    // session is guaranteed non-null here since the gate above already returned early.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Deleted activity "${activity.name}".`,
    });

    return NextResponse.json({ success: true, data: null, message: "Activity deleted successfully." });
  } catch (error) {
    console.error("[Activities] Failed to delete:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't delete this activity. Please try again." },
      { status: 500 }
    );
  }
}
