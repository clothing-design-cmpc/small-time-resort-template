/**
 * FILE: app/api/superAdmin/settings/room-status/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET -> returns the live status (Booked/Cleaning/Available/manual
 *        override) of every room, for the Section 6 room showcase.
 *        Read-only — no audit log needed, nothing is changed here.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRoomStatuses } from "@/services/roomStatus";

export async function GET() {
  try {
    const statuses = await getRoomStatuses();
    return NextResponse.json({ success: true, data: statuses, message: "Room status fetched successfully." });
  } catch (error) {
    console.error("[RoomStatus] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load room status. Please try again." },
      { status: 500 }
    );
  }
}
