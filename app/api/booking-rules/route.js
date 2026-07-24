/**
 * FILE: app/api/booking-rules/route.js
 * ROLE: Public — no auth required, called by the visitor booking form
 *
 * PURPOSE:
 * Read-only view of the currently active BookingRule, trimmed to only
 * the fields the visitor booking form actually needs (nights range,
 * advance booking window, check-in/out times, which booking types are
 * enabled, tour windows/prices, deposit %, cancellation terms).
 * Deliberately separate from
 * app/api/superAdmin/settings/booking-rules/route.js, which is the
 * admin CRUD route for the full list of rule sets — this route never
 * exposes updatedBy or accepts writes, and always resolves to the one
 * rule marked active regardless of how many rule sets exist.
 *
 * DATA FLOW:
 * 1. hooks/usePublicBookingRules.js calls GET /api/booking-rules
 * 2. getActiveBookingRule(type) resolves the active rule INDEPENDENTLY
 *    for each of the three booking types (bootstrapping defaults on a
 *    brand-new project) — Overnight, Day Tour, and Night Tour settings
 *    can come from three different rule sets, since each type has its
 *    own active slot (see services/bookingRules.js). The response below
 *    merges all three into the one flat shape the visitor form expects.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getActiveBookingRule } from "@/services/bookingRules";

export async function GET() {
  try {
    const [overnightRule, dayTourRule, nightTourRule] = await Promise.all([
      getActiveBookingRule("overnight"),
      getActiveBookingRule("day_tour"),
      getActiveBookingRule("night_tour"),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        // Overnight-specific — from the rule set active for Overnight
        allowOvernightStay: overnightRule.allowOvernightStay,
        minNightsRequired: overnightRule.minNightsRequired,
        maxNightsAllowed: overnightRule.maxNightsAllowed,
        advanceBookingDays: overnightRule.advanceBookingDays,
        checkInTime: overnightRule.checkInTime,
        checkOutTime: overnightRule.checkOutTime,
        refundPercentage: overnightRule.refundPercentage,
        cancellationCutoffDays: overnightRule.cancellationCutoffDays,
        depositRequired: overnightRule.depositRequired,
        depositPercentage: overnightRule.depositPercentage,

        // Day Tour-specific — from the rule set active for Day Tour
        allowDayTour: dayTourRule.allowDayTour,
        dayTourStartTime: dayTourRule.dayTourStartTime,
        dayTourEndTime: dayTourRule.dayTourEndTime,
        dayTourPricePerGuest: Number(dayTourRule.dayTourPricePerGuest),

        // Night Tour-specific — from the rule set active for Night Tour
        allowNightTour: nightTourRule.allowNightTour,
        nightTourStartTime: nightTourRule.nightTourStartTime,
        nightTourEndTime: nightTourRule.nightTourEndTime,
        nightTourPricePerGuest: Number(nightTourRule.nightTourPricePerGuest),
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
