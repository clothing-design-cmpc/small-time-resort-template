/**
 * FILE: app/api/superAdmin/settings/booking-rules/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> returns every BookingRule set, newest first, for the Booking
 *         Rules list page. Bootstraps a "Default Rules" row via
 *         getActiveBookingRule() if none exist yet, so the list is
 *         never empty on a brand-new project.
 * POST -> creates a new named rule set (e.g. "Holiday Season Rules").
 *         Pre-save duplicate check on name (Rule 6) since the DB
 *         unique constraint alone would surface as an unfriendly 500.
 *         Never sets isActive here — a new rule set only becomes
 *         active through the dedicated activate endpoint.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";
import { getActiveBookingRule } from "@/services/bookingRules";

export async function GET() {
  try {
    // Bootstraps a "Default Rules" row on a brand-new project so the
    // list is never empty before an admin has created anything.
    await getActiveBookingRule();

    const bookingRules = await prisma.bookingRule.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: bookingRules,
      message: "Booking rule sets fetched successfully.",
    });
  } catch (error) {
    console.error("[BookingRules] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the booking rule sets. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json(
        { success: false, data: null, message: "A name is required for this rule set." },
        { status: 400 }
      );
    }

    // Pre-save duplicate check (Rule 6) — never rely on the DB unique constraint alone.
    const nameTaken = await prisma.bookingRule.findUnique({ where: { name } });
    if (nameTaken) {
      return NextResponse.json(
        { success: false, data: null, message: "A booking rule set with this name already exists." },
        { status: 409 }
      );
    }

    const newRule = await prisma.bookingRule.create({
      data: {
        name,
        // isActive intentionally omitted — defaults to false (schema
        // default). Activating a new rule set is a separate, explicit action.
        minNightsRequired: body.minNightsRequired ?? 1,
        maxNightsAllowed: body.maxNightsAllowed ?? 30,
        advanceBookingDays: body.advanceBookingDays ?? 365,
        checkInTime: body.checkInTime ?? "14:00",
        checkOutTime: body.checkOutTime ?? "11:00",
        allowOvernightStay: body.allowOvernightStay ?? true,
        allowDayTour: body.allowDayTour ?? false,
        allowNightTour: body.allowNightTour ?? false,
        dayTourStartTime: body.dayTourStartTime ?? "08:00",
        dayTourEndTime: body.dayTourEndTime ?? "17:00",
        dayTourPricePerGuest: body.dayTourPricePerGuest ?? 500,
        nightTourStartTime: body.nightTourStartTime ?? "18:00",
        nightTourEndTime: body.nightTourEndTime ?? "23:00",
        nightTourPricePerGuest: body.nightTourPricePerGuest ?? 600,
        refundPercentage: body.refundPercentage ?? 100,
        cancellationCutoffDays: body.cancellationCutoffDays ?? 7,
        depositRequired: body.depositRequired ?? true,
        depositPercentage: body.depositPercentage ?? 50,
        weekendSurchargePercent: body.weekendSurchargePercent ?? 0,
        lastMinuteDiscountPercent: body.lastMinuteDiscountPercent ?? 0,
        groupDiscountThreshold: body.groupDiscountThreshold ?? 3,
        groupDiscountPercent: body.groupDiscountPercent ?? 0,
        seasonalPricingEnabled: body.seasonalPricingEnabled ?? true,
        updatedBy: body.updatedBy || null,
      },
    });

    // Audit trail (Rule 6) — who created which rule set.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Created booking rule set "${newRule.name}".`,
    });

    return NextResponse.json(
      { success: true, data: newRule, message: "Booking rule set created successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[BookingRules] Failed to create:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't create this rule set. Please try again." },
      { status: 500 }
    );
  }
}
