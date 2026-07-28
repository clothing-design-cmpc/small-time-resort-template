/**
 * FILE: app/api/admin/bookings/mark-viewed/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Resets AdminProfile.bookingsLastViewedAt to now() for the calling
 * admin, so the Sidebar's "O" new-bookings badge (see
 * app/api/admin/nav-badges/route.js) clears the moment they actually
 * open the Bookings page — never requiring a manual dismiss action.
 *
 * DATA FLOW:
 * 1. app/superAdmin/(protected)/bookings/page.jsx calls this once on
 *    mount (fire-and-forget, doesn't block the page's own booking fetch)
 * 2. requireSuperAdmin() verifies the session
 * 3. AdminProfile.bookingsLastViewedAt is set to the current timestamp
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";

export async function POST(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    await prisma.adminProfile.update({
      where: { id: session.uid },
      data: { bookingsLastViewedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      data: null,
      message: "Bookings marked as viewed.",
    });
  } catch (error) {
    console.error("[api/admin/bookings/mark-viewed] Failed to update baseline:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to update view baseline." },
      { status: 500 }
    );
  }
}
