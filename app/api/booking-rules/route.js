/**
 * FILE: app/api/booking-rules/route.js
 * ROLE: Public — no auth required, called by the visitor booking form
 *
 * PURPOSE:
 * Read-only view of the super-admin's BookingRules settings, trimmed to
 * only the fields the visitor booking form actually needs (nights
 * range, advance booking window, check-in/out times, which booking
 * types are enabled, tour windows/prices, deposit %, cancellation
 * terms). Deliberately separate from
 * app/api/superAdmin/settings/booking-rules/route.js, which is the
 * admin CRUD route — this route never exposes updatedBy or accepts writes.
 *
 * DATA FLOW:
 * 1. hooks/usePublicBookingRules.js calls GET /api/booking-rules
 * 2. Get-or-create the singleton row (same as the admin route) so the
 *    visitor form always gets sensible defaults even before an admin
 *    has ever opened the settings page
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

export async function GET() {
  try {
    const rules = await prisma.bookingRules.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });

    return NextResponse.json({
      success: true,
      data: {
        minNightsRequired: rules.minNightsRequired,
        maxNightsAllowed: rules.maxNightsAllowed,
        advanceBookingDays: rules.advanceBookingDays,
        checkInTime: rules.checkInTime,
        checkOutTime: rules.checkOutTime,
        allowOvernightStay: rules.allowOvernightStay,
        allowDayTour: rules.allowDayTour,
        allowNightTour: rules.allowNightTour,
        dayTourStartTime: rules.dayTourStartTime,
        dayTourEndTime: rules.dayTourEndTime,
        dayTourPricePerGuest: Number(rules.dayTourPricePerGuest),
        nightTourStartTime: rules.nightTourStartTime,
        nightTourEndTime: rules.nightTourEndTime,
        nightTourPricePerGuest: Number(rules.nightTourPricePerGuest),
        refundPercentage: rules.refundPercentage,
        cancellationCutoffDays: rules.cancellationCutoffDays,
        depositRequired: rules.depositRequired,
        depositPercentage: rules.depositPercentage,
      },
      message: "Booking rules fetched successfully.",
    });
  } catch (error) {
    console.error("[api/booking-rules] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load booking availability. Please try again." },
      { status: 500 }
    );
  }
}
