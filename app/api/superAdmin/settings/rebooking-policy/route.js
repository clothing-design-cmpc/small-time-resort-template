/**
 * FILE: app/api/superAdmin/settings/rebooking-policy/route.js
 * ROLE: Super-admin only — protected by proxy.js's normal super_admin
 *       session gate.
 *
 * PURPOSE:
 * GET -> returns the resort-wide Global Rebooking Policy (SystemSettings,
 *        see services/rebookingPolicy.js): how many times a booking may
 *        be self-service rebooked, whether the deposit becomes
 *        non-refundable on the first rebooking, and what happens once
 *        the limit is reached.
 * PUT -> updates that same global policy. Read by
 *        app/api/bookings/manage/reschedule/route.js on every
 *        self-service reschedule attempt, and by the visitor Policies
 *        page + booking confirmation screens for guest-facing copy.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { getRebookingPolicy, updateRebookingPolicy } from "@/services/rebookingPolicy";

const VALID_LIMIT_ACTIONS = ["non_refundable", "forfeit"];

export async function GET() {
  try {
    const policy = await getRebookingPolicy();
    return NextResponse.json({
      success: true,
      data: policy,
      message: "Rebooking policy fetched successfully.",
    });
  } catch (error) {
    console.error("[rebooking-policy] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load this setting. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  const admin = requireSuperAdmin(request);
  if (!admin) {
    return NextResponse.json({ success: false, data: null, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Null/blank/undefined -> unlimited. Otherwise must be a positive integer.
    let maxRebookingsAllowed = null;
    if (body.maxRebookingsAllowed !== null && body.maxRebookingsAllowed !== "" && body.maxRebookingsAllowed !== undefined) {
      maxRebookingsAllowed = Number(body.maxRebookingsAllowed);
      if (!Number.isInteger(maxRebookingsAllowed) || maxRebookingsAllowed < 1 || maxRebookingsAllowed > 50) {
        return NextResponse.json(
          { success: false, data: null, message: "Max rebookings must be a whole number between 1 and 50, or left blank for unlimited." },
          { status: 400 }
        );
      }
    }

    const rebookingNonRefundableOnFirst = Boolean(body.rebookingNonRefundableOnFirst);

    const rebookingLimitAction = body.rebookingLimitAction;
    if (!VALID_LIMIT_ACTIONS.includes(rebookingLimitAction)) {
      return NextResponse.json(
        { success: false, data: null, message: "Please choose what happens when the rebooking limit is reached." },
        { status: 400 }
      );
    }

    const updatedPolicy = await updateRebookingPolicy(
      { maxRebookingsAllowed, rebookingNonRefundableOnFirst, rebookingLimitAction },
      admin.uid
    );

    return NextResponse.json({
      success: true,
      data: updatedPolicy,
      message: "Rebooking policy updated successfully.",
    });
  } catch (error) {
    console.error("[rebooking-policy] Failed to update:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save this setting. Please try again." },
      { status: 500 }
    );
  }
}
