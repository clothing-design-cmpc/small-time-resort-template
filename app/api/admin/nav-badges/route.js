/**
 * FILE: app/api/admin/nav-badges/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Feeds the Sidebar's two nav badges (Sidebar.jsx):
 *   - Walk-in Inquiries -> "!" urgent badge -> count of inquiries still
 *     awaiting a reply (status "new")
 *   - Bookings -> "O" update badge -> count of bookings placed since
 *     THIS admin last opened the Bookings page (informational only,
 *     never treated as urgent)
 *
 * DATA FLOW:
 * 1. hooks/useNavBadges.js polls this route on an interval from Sidebar.jsx
 * 2. requireSuperAdmin() decodes the session cookie (route is outside
 *    middleware.js's page-only matcher, same pattern as every other
 *    /api/admin/* route)
 * 3. Reads this admin's own AdminProfile.bookingsLastViewedAt as the
 *    baseline, counts inquiries/bookings against it, returns both counts
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
    const adminProfile = await prisma.adminProfile.findUnique({
      where: { id: session.uid },
      select: { bookingsLastViewedAt: true },
    });

    // Fall back to "now" if the profile lookup somehow misses — never
    // let a missing baseline balloon the badge count into every booking
    // that has ever existed.
    const bookingsBaseline = adminProfile?.bookingsLastViewedAt ?? new Date();

    const [pendingWalkInCount, newBookingsCount] = await Promise.all([
      prisma.walkInInquiry.count({ where: { status: "new" } }),
      prisma.booking.count({ where: { createdAt: { gt: bookingsBaseline } } }),
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
