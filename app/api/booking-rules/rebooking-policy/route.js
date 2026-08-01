/**
 * FILE: app/api/booking-rules/rebooking-policy/route.js
 * ROLE: Public — no auth required, read-only
 *
 * PURPOSE:
 * Exposes the resort-wide Rebooking Policy as guest-facing summary
 * copy for Client Components that can't call Prisma directly (the
 * booking confirmation screens and the "Manage My Booking" widget).
 * The visitor Policies page is a Server Component and reads
 * services/rebookingPolicy.js directly instead of calling this route.
 *
 * DATA FLOW:
 * 1. ReservationSummaryClient.jsx / TourReservationSummaryClient.jsx /
 *    ManageBookingWidget.jsx fetch this on mount
 * 2. Returns the same { title, body } shape the Policies page renders,
 *    so the guest sees identical wording everywhere
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRebookingPolicy, buildRebookingPolicySummary } from "@/services/rebookingPolicy";

export async function GET() {
  try {
    const policy = await getRebookingPolicy();
    const summary = buildRebookingPolicySummary(policy);
    return NextResponse.json({
      success: true,
      data: { ...summary, maxRebookingsAllowed: policy.maxRebookingsAllowed },
      message: "Rebooking policy fetched successfully.",
    });
  } catch (error) {
    console.error("[booking-rules/rebooking-policy] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load rebooking policy." },
      { status: 500 }
    );
  }
}
