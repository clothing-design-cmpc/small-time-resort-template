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
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

// "Cleaning" is intentionally NOT a valid manual reason anymore —
// cleaning is now fully automatic (services/roomStatus.js computes a
// "Checked-Out — Cleaning" window from a booking's checkout moment +
// BookingRule.cleaningHours, on the currently active rule set). A
// manually-created BlackoutDate row
// is only ever for a deliberate admin decision to take a room offline.
const VALID_REASONS = ["Maintenance", "Private", "Custom"];

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

    // Guard against an inverted range — without this, the availability
    // calendar would silently block nothing (or everything, depending
    // on how the query compares the dates). Equal start/end IS valid —
    // it's a single-day block, which is exactly what clicking one day
    // on the calendar creates.
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
      return NextResponse.json(
        { success: false, data: null, message: "End date must be on or after the start date." },
        { status: 400 }
      );
    }

    const reason = VALID_REASONS.includes(body.reason) ? body.reason : "Custom";

    const blackoutDate = await prisma.blackoutDate.create({
      data: {
        roomId: body.roomId,
        startDate,
        endDate,
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
      details: `Added a blackout range for "${blackoutDate.room.name}" (${body.startDate} – ${body.endDate}, reason: ${reason}).`,
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
