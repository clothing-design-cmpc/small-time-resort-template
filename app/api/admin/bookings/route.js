/**
 * FILE: app/api/admin/bookings/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Returns every Booking row (confirmed AND cancelled — admins need the
 * full picture, unlike the public /api/bookings/dates route which only
 * exposes confirmed dates) with the related room's name, for the
 * Bookings table on the super-admin dashboard. Each row is also
 * annotated with packageAllowedGuests/packageMaxPax — the BookingRule
 * that priced it — so BookingDetailsModal can show "how many guests
 * were actually booked" next to "how many this package allows/caps at"
 * (Rule: distinct from Booking.numberOfGuests, which is the guest-
 * entered count — see prisma/schema.prisma's allowedGuests/maxPax
 * comments on BookingRule).
 *
 * DATA FLOW:
 * 1. app/superAdmin/(protected)/bookings/page.jsx fetches this on mount
 * 2. requireSuperAdmin() decodes the session cookie — middleware.js's
 *    matcher only covers /superAdmin/* pages, not /api/*, so this route
 *    must check authorization itself
 * 3. Queries all bookings, newest first, including room.name
 * 4. Resolves each distinct (bookingType, howManySelectedDates) combo's
 *    matching BookingRule ONCE (services/bookingRules.js), then maps
 *    that rule's allowedGuests/maxPax onto every booking sharing that
 *    combo — avoids one BookingRule lookup per booking row
 * 5. Returns { success, data: { bookings }, message }
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { getActiveBookingRuleForDateCount } from "@/services/bookingRules";

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

    // Resolve each distinct (bookingType, howManySelectedDates) combo's
    // BookingRule once, cached by a simple string key — a resort-sized
    // booking list has very few distinct combos even with hundreds of
    // bookings, so this stays cheap.
    const ruleCache = new Map();
    async function getPackagePaxInfo(bookingType, howManySelectedDates) {
      const key = `${bookingType}:${howManySelectedDates}`;
      if (!ruleCache.has(key)) {
        const rule = await getActiveBookingRuleForDateCount(bookingType, howManySelectedDates).catch(() => null);
        ruleCache.set(key, rule ? { allowedGuests: rule.allowedGuests, maxPax: rule.maxPax } : null);
      }
      return ruleCache.get(key);
    }

    const enrichedBookings = await Promise.all(
      bookings.map(async (booking) => {
        const packagePaxInfo = await getPackagePaxInfo(booking.bookingType, booking.howManySelectedDates);
        return {
          ...booking,
          packageAllowedGuests: packagePaxInfo?.allowedGuests ?? null,
          packageMaxPax: packagePaxInfo?.maxPax ?? null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: { bookings: enrichedBookings },
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
