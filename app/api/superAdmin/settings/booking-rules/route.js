/**
 * FILE: app/api/superAdmin/settings/booking-rules/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET  -> fetch every BookingRule set for the Booking Rules list page,
 *         newest first.
 * POST -> create a new rule set. Blocks duplicate names. Every new rule
 *         set starts Active by default — the admin can toggle it to
 *         Inactive afterward from the list page (dedicated activate
 *         endpoint, app/api/superAdmin/settings/booking-rules/[ruleId]/activate/route.js).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET(request) {
  try {
    const bookingRules = await prisma.bookingRule.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: bookingRules, message: "Booking rule sets fetched successfully." });
  } catch (error) {
    console.error("[BookingRules] Failed to fetch list:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load booking rule sets. Please try again." },
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
        { success: false, data: null, message: "A rule set name is required." },
        { status: 400 }
      );
    }

    // Duplicate check — rule set names must be unique (Rule 6).
    const nameTaken = await prisma.bookingRule.findUnique({ where: { name } });
    if (nameTaken) {
      return NextResponse.json(
        { success: false, data: null, message: "A booking rule set with this name already exists." },
        { status: 409 }
      );
    }

    const createdRule = await prisma.bookingRule.create({
      data: {
        name,
        // Every new rule set starts Active — the admin can toggle it to
        // Inactive afterward from the list page if needed.
        isActive: true,
        minNightsRequired: body.minNightsRequired,
        maxNightsAllowed: body.maxNightsAllowed,
        advanceBookingDays: body.advanceBookingDays,
        ruleDates: Array.isArray(body.ruleDates) ? body.ruleDates : undefined,
        // Denormalized nights count for the date-count rule matching
        // used by services/bookingRules.js -> getActiveBookingRuleForDateCount()
        // (see BookingRule.howManySelectedDates in prisma/schema.prisma).
        howManySelectedDates: Array.isArray(body.ruleDates) ? body.ruleDates.length : undefined,
        checkInTime: body.checkInTime,
        checkOutTime: body.checkOutTime,
        cleaningHours: body.cleaningHours,
        // Visitor-facing guest count for this rule set — read by the
        // public reservation page (app/visitor/booking/ReservationSummaryClient.jsx)
        // and displayed there as text instead of an editable input.
        allowedGuests: body.allowedGuests,
        // Allowed Pax — hard capacity cap, distinct from allowedGuests
        // above (see prisma/schema.prisma BookingRule.maxPax comment).
        maxPax: body.maxPax,
        // Package Inclusions — shown to the visitor as "Included in
        // this package" on the reservation summary.
        includedAmenityIds: Array.isArray(body.includedAmenityIds) ? body.includedAmenityIds : undefined,
        // Package Inclusions -> Shop Products checklist (StoreProduct.id
        // values) — same wiring as includedAmenityIds above.
        includedProductIds: Array.isArray(body.includedProductIds) ? body.includedProductIds : undefined,
        packageInclusions: Array.isArray(body.packageInclusions) ? body.packageInclusions : undefined,
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

    // Audit trail (Rule 6) — record who created this rule set.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Created booking rule set "${createdRule.name}".`,
    });

    return NextResponse.json(
      { success: true, data: createdRule, message: `"${createdRule.name}" created successfully.` },
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