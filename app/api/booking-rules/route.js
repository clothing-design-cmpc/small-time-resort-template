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
 * 1. hooks/usePublicBookingRules.js calls GET /api/booking-rules,
 *    optionally with ?nights=N once the visitor has picked their dates
 *    (N = nights selected, i.e. Booking.howManySelectedDates)
 * 2. getActiveBookingRuleForDateCount("overnight", N) first tries to
 *    match an Active Overnight rule set built for exactly N nights
 *    (BookingRule.howManySelectedDates — e.g. "4Ds-3Ns" has N = 3)
 *    before falling back to getActiveBookingRule()'s "most recently
 *    updated Active rule" behavior. Day Tour and Night Tour always use
 *    getActiveBookingRule() directly — this per-length matching only
 *    applies to Overnight, per Section 1 Rule 2 on Booking Rules.
 *    The response below merges all three into the one flat shape the
 *    visitor form expects, plus the matched rule's own name so the
 *    booking form can show which package actually applies.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getActiveBookingRule, getActiveBookingRuleForDateCount } from "@/services/bookingRules";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const nightsParam = Number(searchParams.get("nights"));
    const nightsSelected = Number.isInteger(nightsParam) && nightsParam > 0 ? nightsParam : null;

    const [overnightRule, dayTourRule, nightTourRule] = await Promise.all([
      getActiveBookingRuleForDateCount("overnight", nightsSelected),
      getActiveBookingRule("day_tour"),
      getActiveBookingRule("night_tour"),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        // Overnight-specific — from the rule set active (and, if
        // nightsSelected was given, matched) for Overnight
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
        // Name + night count of whichever rule set actually resolved
        // above — lets the booking form display "4Ds-3Ns" etc. instead
        // of a generic "Overnight Stay" label.
        matchedRuleName: overnightRule.name,
        matchedRuleNights: overnightRule.howManySelectedDates,

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
