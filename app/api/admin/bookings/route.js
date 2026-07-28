/**
 * FILE: app/api/admin/bookings/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Returns every Booking row (confirmed AND cancelled — admins need the
 * full picture, unlike the public /api/bookings/dates route which only
 * exposes confirmed dates) with the related room's name, for the
 * Bookings table on the super-admin dashboard.
 *
 * DATA FLOW:
 * 1. app/superAdmin/(protected)/bookings/page.jsx fetches this on mount
 * 2. requireSuperAdmin() decodes the session cookie — middleware.js's
 *    matcher only covers /superAdmin/* pages, not /api/*, so this route
 *    must check authorization itself
 * 3. Queries all bookings, newest first, including room.name
 * 4. Returns { success, data: { bookings }, message }
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
    const bookings = await prisma.booking.findMany({
      orderBy: { checkInDate: "asc" },
      include: { room: { select: { name: true } } },
    });

    return NextResponse.json({
      success: true,
      data: { bookings },
      message: "Bookings fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/bookings] Failed to fetch bookings:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load bookings. Please try again." },
      { status: 500 }
    );
  }
}
