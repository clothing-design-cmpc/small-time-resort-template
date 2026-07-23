/**
 * FILE: app/api/superAdmin/settings/room-status/route.js
 * ROLE: Super-admin only — protected by proxy.js's normal super_admin
 *       session gate.
 *
 * PURPOSE:
 * Read-only: returns every active room's CURRENT computed status
 * (services/roomStatus.js) for Section 6's room card grid. Never
 * writes anything — manual overrides (Maintenance/Private/Custom)
 * still go through the existing blackout-dates CRUD routes; Booked
 * and Cleaning are pure read-time computation, never stored rows.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAllRoomStatuses } from "@/services/roomStatus";

export async function GET() {
  try {
    const roomStatuses = await getAllRoomStatuses();
    return NextResponse.json({
      success: true,
      data: roomStatuses,
      message: "Room statuses fetched successfully.",
    });
  } catch (error) {
    console.error("[room-status] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load room statuses. Please try again." },
      { status: 500 }
    );
  }
}
