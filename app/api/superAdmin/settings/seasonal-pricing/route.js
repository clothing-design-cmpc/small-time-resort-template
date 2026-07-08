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

    const seasonalPrice = await prisma.seasonalPrice.create({
      data: {
        roomId: body.roomId,
        seasonName: body.seasonName,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        pricePerNight: body.pricePerNight,
      },
      include: { room: { select: { name: true } } },
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
