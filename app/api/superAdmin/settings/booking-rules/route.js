/**
 * FILE: app/api/superAdmin/settings/booking-rules/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> list every named BookingRule set for the Booking Rules list
 *         page, newest-updated first, so the admin can see which one
 *         is active and pick one to edit.
 * POST -> create a new named rule set from the Create form. Blocks
 *         duplicate names up front (Rule 6's pre-save duplicate
 *         check) — the DB's own @unique on name is the defense-in-depth
 *         backup for race conditions.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET(request) {
  try {
    const bookingRules = await prisma.bookingRule.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ success: true, data: bookingRules, message: "Booking rule sets fetched successfully." });
  } catch (error) {
    console.error("[BookingRules] Failed to list:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load this data. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json({ success: false, data: null, message: "Give this rule set a name." }, { status: 400 });
    }

    // Pre-save duplicate check — normalized to trimmed value before comparing.
    const nameTaken = await prisma.bookingRule.findUnique({ where: { name } });
    if (nameTaken) {
      return NextResponse.json(
        { success: false, data: null, message: "A booking rule set with this name already exists." },
        { status: 409 }
      );
    }

    // New rule sets are never created active — an admin activates one
    // deliberately from the list page, so this can't silently replace
    // whichever rule set the pricing engine is currently using.
    const createdRule = await prisma.bookingRule.create({
      data: {
        name,
        minNightsRequired: body.minNightsRequired,
        maxNightsAllowed: body.maxNightsAllowed,
        advanceBookingDays: body.advanceBookingDays,
        ruleDates: Array.isArray(body.ruleDates) ? body.ruleDates : undefined,
        checkInTime: body.checkInTime,
        checkOutTime: body.checkOutTime,
        cleaningHours: body.cleaningHours,
        allowOvernightStay: body.allowOvernightStay,
        allowDayTour: body.allowDayTour,
        allowNightTour: body.allowNightTour,
        dayTourStartTime: body.dayTourStartTime,
        dayTourEndTime: body.dayTourEndTime,
        dayTourPricePerGuest: body.dayTourPricePerGuest,
        nightTourStartTime: body.nightTourStartTime,
        nightTourEndTime: body.nightTourEndTime,
        nightTourPricePerGuest: body.nightTourPricePerGuest,
        hourlyChargeAmount: body.hourlyChargeAmount,
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
    });

    // Audit trail (Rule 6) — new rule sets are a business-meaningful change.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Created booking rule set "${createdRule.name}".`,
    });

    return NextResponse.json({ success: true, data: createdRule, message: "Booking rule set created successfully." }, { status: 201 });
  } catch (error) {
    console.error("[BookingRules] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't create this rule set. Please try again." },
      { status: 500 }
    );
  }
}