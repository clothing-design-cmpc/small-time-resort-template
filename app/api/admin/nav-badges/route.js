/**
 * FILE: app/api/admin/nav-badges/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Feeds the Sidebar's two nav badges (Sidebar.jsx):
 *   - Walk-in Inquiries -> "!" urgent badge -> count of inquiries still
 *     awaiting a reply (status "new")
 *   - Bookings -> "O" update badge -> count of bookings still awaiting
 *     admin action (status "pending"). Same pattern as the walk-in
 *     badge above: tied to an unresolved status, never to a
 *     per-admin "last viewed" timestamp, so it correctly stays lit as
 *     long as ANY pending booking exists — opening the Bookings page
 *     no longer silently clears it while requests still need a
 *     Confirm/Reject decision.
 *
 * DATA FLOW:
 * 1. hooks/useNavBadges.js polls this route on an interval from Sidebar.jsx
 * 2. requireSuperAdmin() decodes the session cookie (route is outside
 *    middleware.js's page-only matcher, same pattern as every other
 *    /api/admin/* route)
 * 3. Counts inquiries with status "new" and bookings with status
 *    "pending" directly — no per-admin baseline lookup needed
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

  try {
    const [pendingWalkInCount, newBookingsCount] = await Promise.all([
      prisma.walkInInquiry.count({ where: { status: "new" } }),
      prisma.booking.count({ where: { status: "pending" } }),
    ]);

    return NextResponse.json({
      success: true,
      data: { pendingWalkInCount, newBookingsCount },
      message: "Nav badges fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/nav-badges] Failed to fetch badge counts:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load nav badges." },
      { status: 500 }
    );
  }
}
