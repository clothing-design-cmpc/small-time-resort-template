/**
 * FILE: app/api/superAdmin/settings/pending-hold-hours/route.js
 * ROLE: Super-admin only — protected by proxy.js's normal super_admin
 *       session gate (PUT); GET is safe to leave unauthenticated in the
 *       same way cleaning-hours' GET is, since it only exposes a single
 *       non-sensitive number.
 *
 * PURPOSE:
 * GET -> returns the resort-wide DP Countdown value (SystemSettings.
 *        pendingHoldHours, see services/pendingHoldHours.js) — the
 *        number of hours a new "pending" booking holds its dates before
 *        app/api/cron/booking-expiry/route.js auto-expires it.
 * PUT -> updates that same global value. Never touches any existing
 *        Booking row: every currently-pending booking already has its
 *        own Booking.pendingExpiresAt saved from whatever this value
 *        was at ITS creation time (app/api/bookings/route.js), so
 *        saving a new value here can only ever affect bookings created
 *        AFTER this save — no active pending booking is ever re-timed
 *        or errors out because of this change.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { getGlobalPendingHoldHours, updateGlobalPendingHoldHours } from "@/services/pendingHoldHours";

// Sane bounds — at least 1 hour (a booking must hold for some minimum
// time) and at most 30 days (720 hours), well past any realistic DP
// window, so a mistyped value can't accidentally hold dates forever.
const MIN_PENDING_HOLD_HOURS = 1;
const MAX_PENDING_HOLD_HOURS = 720;

export async function GET() {
  try {
    const pendingHoldHours = await getGlobalPendingHoldHours();
    return NextResponse.json({
      success: true,
      data: { pendingHoldHours },
      message: "DP Countdown fetched successfully.",
    });
  } catch (error) {
    console.error("[pending-hold-hours] Failed to fetch:", error.message);
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
    const pendingHoldHours = Number(body.pendingHoldHours);

    if (
      !Number.isFinite(pendingHoldHours) ||
      !Number.isInteger(pendingHoldHours) ||
      pendingHoldHours < MIN_PENDING_HOLD_HOURS ||
      pendingHoldHours > MAX_PENDING_HOLD_HOURS
    ) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: `DP Countdown must be a whole number between ${MIN_PENDING_HOLD_HOURS} and ${MAX_PENDING_HOLD_HOURS} hours.`,
        },
        { status: 400 }
      );
    }

    const updatedSettings = await updateGlobalPendingHoldHours(pendingHoldHours, admin.uid);

    return NextResponse.json({
      success: true,
      data: updatedSettings,
      message: `DP Countdown updated to ${pendingHoldHours} hour(s). This only applies to bookings made from now on — bookings already pending keep their original countdown.`,
    });
  } catch (error) {
    console.error("[pending-hold-hours] Failed to update:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save this setting. Please try again." },
      { status: 500 }
    );
  }
}
