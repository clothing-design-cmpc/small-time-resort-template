/**
 * FILE: app/api/superAdmin/settings/blackout-dates/[blackoutId]/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * PUT    -> updates a blackout date range's dates/reason.
 * DELETE -> removes a blackout date range.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

// See app/api/superAdmin/settings/blackout-dates/route.js for why
// "Cleaning" was removed from this list.
const VALID_REASONS = ["Maintenance", "Private", "Custom"];

export async function PUT(request, { params }) {
  const { blackoutId } = await params;

  try {
    const body = await request.json();

    const existingEntry = await prisma.blackoutDate.findUnique({ where: { id: blackoutId } });
    if (!existingEntry) {
      return NextResponse.json({ success: false, data: null, message: "Blackout range not found." }, { status: 404 });
    }

    const reason = VALID_REASONS.includes(body.reason) ? body.reason : existingEntry.reason;

    const updatedEntry = await prisma.blackoutDate.update({
      where: { id: blackoutId },
      data: {
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        reason,
      },
      include: { room: { select: { name: true } } },
    });

    // Audit trail (Rule 6) — blackout dates directly affect availability.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Updated blackout range for "${updatedEntry.room.name}" (${body.startDate} – ${body.endDate}).`,
    });

    return NextResponse.json({ success: true, data: updatedEntry, message: "Blackout range updated successfully." });
  } catch (error) {
    console.error("[BlackoutDates] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save the changes. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const { blackoutId } = await params;

  try {
    const existingEntry = await prisma.blackoutDate.findUnique({ where: { id: blackoutId } });
    if (!existingEntry) {
      return NextResponse.json({ success: false, data: null, message: "Blackout range not found." }, { status: 404 });
    }

    await prisma.blackoutDate.delete({ where: { id: blackoutId } });

    // Audit trail (Rule 6) — deletions are the most important action to trace.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Deleted a blackout range (${existingEntry.startDate.toISOString().slice(0, 10)} – ${existingEntry.endDate.toISOString().slice(0, 10)}).`,
    });

    return NextResponse.json({ success: true, data: null, message: "Blackout range deleted successfully." });
  } catch (error) {
    console.error("[BlackoutDates] Failed to delete:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't delete this blackout range. Please try again." },
      { status: 500 }
    );
  }
}
