/**
 * FILE: app/api/superAdmin/settings/cleaning-hours/route.js
 * ROLE: Super-admin only — protected by proxy.js's normal super_admin
 *       session gate.
 *
 * PURPOSE:
 * GET -> returns the currently ACTIVE BookingRule's cleaningHours (the
 *        per-rule-set number of hours a room stays "Checked-Out —
 *        Cleaning" after a guest's checkout before auto-flipping to
 *        "Available" — see the field's own schema comment on
 *        BookingRule for why this is per-rule-set, not resort-wide).
 * PUT -> updates it on that same active rule. Read by
 *        services/roomStatus.js (via getActiveBookingRule()) on every
 *        room-status computation.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { getActiveBookingRule } from "@/services/bookingRules";

export async function GET() {
  try {
    // cleaningHours lives on BookingRule (per active rule set), not on
    // SystemSettings — this mirrors exactly what services/roomStatus.js
    // reads when computing each room's current status.
    const activeRule = await getActiveBookingRule();
    return NextResponse.json({
      success: true,
      data: { cleaningHours: activeRule.cleaningHours },
      message: "Cleaning hours fetched successfully.",
    });
  } catch (error) {
    console.error("[cleaning-hours] Failed to fetch:", error.message);
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
    const cleaningHours = Number(body.cleaningHours);

    if (!Number.isFinite(cleaningHours) || cleaningHours < 0 || cleaningHours > 24) {
      return NextResponse.json(
        { success: false, data: null, message: "Cleaning hours must be a number between 0 and 24." },
        { status: 400 }
      );
    }

    // Save onto the currently active BookingRule — never SystemSettings —
    // so the value actually affects services/roomStatus.js's computation,
    // which always reads cleaningHours off getActiveBookingRule().
    const activeRule = await getActiveBookingRule();
    const updatedRule = await prisma.bookingRule.update({
      where: { id: activeRule.id },
      data: { cleaningHours },
      select: { cleaningHours: true },
    });

    return NextResponse.json({
      success: true,
      data: updatedRule,
      message: `Cleaning hours updated to ${cleaningHours}.`,
    });
  } catch (error) {
    console.error("[cleaning-hours] Failed to update:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save this setting. Please try again." },
      { status: 500 }
    );
  }
}