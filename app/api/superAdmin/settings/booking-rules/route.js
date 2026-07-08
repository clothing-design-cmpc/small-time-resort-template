/**
 * FILE: app/api/superAdmin/settings/booking-rules/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET -> returns the single BookingRules row, creating it with schema
 *        defaults on first request if it doesn't exist yet (get-or-
 *        create — there is exactly one row, id = "singleton").
 * PUT -> updates the BookingRules row with the full settings form
 *        payload (Sections 1-5 of blueprint Page 7).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

export async function GET() {
  try {
    // Get-or-create: the very first admin to open this page creates the
    // row with schema defaults — no separate seed step needed.
    const rules = await prisma.bookingRules.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });

    return NextResponse.json({ success: true, data: rules, message: "Booking rules fetched successfully." });
  } catch (error) {
    console.error("[BookingRules] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the booking rules. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();

    const updatedRules = await prisma.bookingRules.upsert({
      where: { id: "singleton" },
      update: {
        minNightsRequired: body.minNightsRequired,
        maxNightsAllowed: body.maxNightsAllowed,
        advanceBookingDays: body.advanceBookingDays,
        checkInTime: body.checkInTime,
        checkOutTime: body.checkOutTime,
        allowOvernightStay: body.allowOvernightStay,
        allowDayTour: body.allowDayTour,
        allowNightTour: body.allowNightTour,
        refundPercentage: body.refundPercentage,
        cancellationCutoffDays: body.cancellationCutoffDays,
        depositRequired: body.depositRequired,
        depositPercentage: body.depositPercentage,
        weekendSurchargePercent: body.weekendSurchargePercent,
        lastMinuteDiscountPercent: body.lastMinuteDiscountPercent,
        groupDiscountThreshold: body.groupDiscountThreshold,
        groupDiscountPercent: body.groupDiscountPercent,
        seasonalPricingEnabled: body.seasonalPricingEnabled,
        updatedBy: body.updatedBy || null,
      },
      create: { id: "singleton", ...body },
    });

    return NextResponse.json({ success: true, data: updatedRules, message: "Booking rules saved successfully." });
  } catch (error) {
    console.error("[BookingRules] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save the booking rules. Please try again." },
      { status: 500 }
    );
  }
}
