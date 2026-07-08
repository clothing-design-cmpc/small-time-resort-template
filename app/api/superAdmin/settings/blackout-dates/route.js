/**
 * FILE: app/api/superAdmin/settings/blackout-dates/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every blackout date range across all rooms, newest
 *         start date first, with the room name included for display.
 * POST -> creates a new blackout date range for a room.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

const VALID_REASONS = ["Cleaning", "Maintenance", "Private", "Custom"];

export async function GET() {
  try {
    const blackoutDates = await prisma.blackoutDate.findMany({
      include: { room: { select: { name: true } } },
      orderBy: { startDate: "desc" },
    });
    return NextResponse.json({
      success: true,
      data: blackoutDates,
      message: "Blackout dates fetched successfully.",
    });
  } catch (error) {
    console.error("[BlackoutDates] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load blackout dates. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    if (!body.roomId || !body.startDate || !body.endDate) {
      return NextResponse.json(
        { success: false, data: null, message: "Room, start date, and end date are required." },
        { status: 400 }
      );
    }

    const reason = VALID_REASONS.includes(body.reason) ? body.reason : "Custom";

    const blackoutDate = await prisma.blackoutDate.create({
      data: {
        roomId: body.roomId,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        reason,
      },
      include: { room: { select: { name: true } } },
    });

    return NextResponse.json(
      { success: true, data: blackoutDate, message: "Blackout dates added successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[BlackoutDates] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't add this blackout range. Please try again." },
      { status: 500 }
    );
  }
}
