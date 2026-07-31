/**
 * FILE: app/api/superAdmin/settings/cleaning-hours/route.js
 * ROLE: Super-admin only — protected by proxy.js's normal super_admin
 *       session gate.
 *
 * PURPOSE:
 * GET -> returns the resort-wide Cleaning Hours value (SystemSettings,
 *        see services/cleaningHours.js) — the single number of hours a
 *        room stays "Checked-Out — Cleaning" after a guest's checkout
 *        before auto-flipping to "Available", shared by every booking
 *        type and every rule set.
 * PUT -> updates that same global value. Since it's no longer tied to
 *        one rule set, a new value is checked against EVERY currently
 *        Active BookingRule's own check-in/check-out time pairs — not
 *        just one row — before it's allowed to save. Read by
 *        services/roomStatus.js and services/bookingPricing.js (via
 *        getGlobalCleaningHours()) on every room-status computation and
 *        every new booking.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { getGlobalCleaningHours, updateGlobalCleaningHours } from "@/services/cleaningHours";
import { findAllCleaningBufferConflicts } from "@/services/cleaningBuffer";

export async function GET() {
  try {
    const cleaningHours = await getGlobalCleaningHours();
    return NextResponse.json({
      success: true,
      data: { cleaningHours },
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

    // Cleaning-buffer conflict check — since this value is now
    // resort-wide, it must be checked against EVERY currently Active
    // rule set's own time pairs (Overnight, Day Tour, Night Tour), not
    // just one — any number of rule sets can be Active at once (see
    // services/bookingRules.js), and this one Cleaning Hours value will
    // apply to all of them equally.
    const activeRules = await prisma.bookingRule.findMany({ where: { isActive: true } });

    for (const rule of activeRules) {
      const bufferConflict = findAllCleaningBufferConflicts(
        {
          checkInTime: rule.checkInTime,
          checkOutTime: rule.checkOutTime,
          dayTourStartTime: rule.dayTourStartTime,
          dayTourEndTime: rule.dayTourEndTime,
          nightTourStartTime: rule.nightTourStartTime,
          nightTourEndTime: rule.nightTourEndTime,
        },
        cleaningHours
      );
      if (bufferConflict) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: `"${rule.name}": ${bufferConflict.message}`,
            conflictFields: bufferConflict.fields,
          },
          { status: 400 }
        );
      }
    }

    const updatedSettings = await updateGlobalCleaningHours(cleaningHours, admin.uid);

    return NextResponse.json({
      success: true,
      data: updatedSettings,
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