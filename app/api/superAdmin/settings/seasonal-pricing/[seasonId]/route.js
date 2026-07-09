/**
 * FILE: app/api/superAdmin/settings/seasonal-pricing/[seasonId]/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * PUT    -> updates a seasonal price entry's dates/price/season name.
 * DELETE -> removes a seasonal price entry.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function PUT(request, { params }) {
  const { seasonId } = await params;

  try {
    const body = await request.json();

    const existingEntry = await prisma.seasonalPrice.findUnique({ where: { id: seasonId } });
    if (!existingEntry) {
      return NextResponse.json({ success: false, data: null, message: "Seasonal price not found." }, { status: 404 });
    }

    const updatedEntry = await prisma.seasonalPrice.update({
      where: { id: seasonId },
      data: {
        seasonName: body.seasonName,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        pricePerNight: body.pricePerNight,
      },
      include: { room: { select: { name: true } } },
    });

    // Audit trail (Rule 6) — dynamic pricing changes directly affect revenue.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Updated seasonal price "${existingEntry.seasonName}" for "${updatedEntry.room.name}" (₱${existingEntry.pricePerNight} → ₱${updatedEntry.pricePerNight}).`,
    });

    return NextResponse.json({ success: true, data: updatedEntry, message: "Seasonal price updated successfully." });
  } catch (error) {
    console.error("[SeasonalPricing] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save the changes. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const { seasonId } = await params;

  try {
    const existingEntry = await prisma.seasonalPrice.findUnique({ where: { id: seasonId } });
    if (!existingEntry) {
      return NextResponse.json({ success: false, data: null, message: "Seasonal price not found." }, { status: 404 });
    }

    await prisma.seasonalPrice.delete({ where: { id: seasonId } });

    // Audit trail (Rule 6) — deletions are the most important action to trace.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Deleted seasonal price "${existingEntry.seasonName}".`,
    });

    return NextResponse.json({ success: true, data: null, message: "Seasonal price deleted successfully." });
  } catch (error) {
    console.error("[SeasonalPricing] Failed to delete:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't delete this seasonal price. Please try again." },
      { status: 500 }
    );
  }
}
