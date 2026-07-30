/**
 * FILE: app/api/superAdmin/settings/seasonal-pricing/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every seasonal price entry across all rooms, newest
 *         date range first, with the room name included for display.
 * POST -> creates a new seasonal price entry for a room.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";

export async function GET() {
  try {
    const seasonalPrices = await prisma.seasonalPrice.findMany({
      include: { room: { select: { name: true } } },
      orderBy: { startDate: "desc" },
    });
    return NextResponse.json({
      success: true,
      data: seasonalPrices,
      message: "Seasonal prices fetched successfully.",
    });
  } catch (error) {
    console.error("[SeasonalPricing] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load seasonal pricing. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    if (!body.roomId || !body.seasonName || !body.startDate || !body.endDate || body.pricePerNight == null) {
      return NextResponse.json(
        { success: false, data: null, message: "Room, season name, dates, and price are all required." },
        { status: 400 }
      );
    }

    // Guard against an inverted or zero-length range — an unchecked
    // range here would silently apply the wrong price for the wrong
    // dates on the visitor booking calendar.
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      return NextResponse.json(
        { success: false, data: null, message: "End date must be after the start date." },
        { status: 400 }
      );
    }

    const seasonalPrice = await prisma.seasonalPrice.create({
      data: {
        roomId: body.roomId,
        seasonName: body.seasonName,
        startDate,
        endDate,
        pricePerNight: body.pricePerNight,
      },
      include: { room: { select: { name: true } } },
    });

    // Audit trail (Rule 6) — dynamic pricing changes directly affect revenue.
    const session = requireSuperAdmin(request);
    await logAuditEvent({
      actor: session?.uid ?? null,
      action: "created",
      targetType: "SeasonalPrice",
      targetId: seasonalPrice.id,
      targetName: `${seasonalPrice.seasonName} — ${seasonalPrice.room.name}`,
      request,
      details: `Added seasonal price "${seasonalPrice.seasonName}" for "${seasonalPrice.room.name}" (₱${seasonalPrice.pricePerNight}/night).`,
    });

    return NextResponse.json(
      { success: true, data: seasonalPrice, message: "Seasonal price added successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[SeasonalPricing] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't add this seasonal price. Please try again." },
      { status: 500 }
    );
  }
}
