/**
 * FILE: app/api/admin/reports/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Read-only, date-range-scoped business report: total revenue, booking
 * counts (confirmed vs. cancelled), occupancy rate, a per-day revenue
 * series for the chart, and a breakdown by room and by booking type.
 * This is the exportable-report counterpart to the live Analytics
 * dashboard (app/superAdmin/(protected)/analytics) — Analytics shows
 * rolling 30-day trend cards for day-to-day monitoring; this route
 * answers "give me the numbers for THIS specific date range" so an
 * admin can pull, say, last month's figures for an owner or an
 * accountant, which is what ReportsClient's CSV export is for.
 *
 * DATA FLOW:
 * 1. app/superAdmin/(protected)/reports/ReportsClient.jsx fetches this
 *    on mount (defaulting to the current calendar month) and again
 *    whenever the admin changes the date range
 * 2. requireSuperAdmin() checks the session — this route is never
 *    protected by middleware.js (its matcher only covers page routes)
 * 3. Every number here is derived from Booking rows whose checkInDate
 *    falls inside [startDate, endDate] — a report period represents
 *    stays happening in that window, not bookings merely MADE in it
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole-day difference between two Date objects, minimum 1 (a same-day tour still occupies that one day). */
function nightsBetween(checkIn, checkOut) {
  const diffDays = Math.round((checkOut.getTime() - checkIn.getTime()) / MS_PER_DAY);
  return Math.max(1, diffDays);
}

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();

    // Default range: the current calendar month — the most common
    // "give me this month's numbers" request, so it's a useful report
    // the instant the page loads with no date-picking required.
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const startDate = searchParams.get("startDate") ? new Date(searchParams.get("startDate")) : defaultStart;
    const endDate = searchParams.get("endDate") ? new Date(searchParams.get("endDate")) : defaultEnd;

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      return NextResponse.json(
        { success: false, data: null, message: "Invalid date range." },
        { status: 400 }
      );
    }

    const [bookingsInRange, activeRooms] = await Promise.all([
      prisma.booking.findMany({
        where: { checkInDate: { gte: startDate, lte: endDate } },
        select: {
          id: true,
          roomId: true,
          bookingType: true,
          checkInDate: true,
          checkOutDate: true,
          totalAmount: true,
          status: true,
          room: { select: { name: true } },
        },
      }),
      prisma.room.count({ where: { isActive: true } }),
    ]);

    const confirmedBookings = bookingsInRange.filter((b) => b.status !== "cancelled");
    const cancelledBookings = bookingsInRange.filter((b) => b.status === "cancelled");

    const totalRevenue = confirmedBookings.reduce((sum, b) => sum + Number(b.totalAmount), 0);

    // Occupancy: total room-nights actually booked (confirmed only)
    // divided by total room-nights available in the period (active
    // room count x number of days in range).
    const daysInRange = Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
    const totalRoomNightsAvailable = activeRooms * daysInRange;
    const bookedRoomNights = confirmedBookings.reduce(
      (sum, b) => sum + nightsBetween(new Date(b.checkInDate), new Date(b.checkOutDate)),
      0
    );
    const occupancyRate =
      totalRoomNightsAvailable > 0
        ? Math.min(100, Math.round((bookedRoomNights / totalRoomNightsAvailable) * 1000) / 10)
        : 0;

    // Per-day revenue series for the chart — one entry per calendar day
    // in range, seeded at 0 so days with no check-ins still show a
    // point rather than a gap.
    const dailyRevenueMap = new Map();
    for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + MS_PER_DAY)) {
      dailyRevenueMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const booking of confirmedBookings) {
      const key = new Date(booking.checkInDate).toISOString().slice(0, 10);
      if (dailyRevenueMap.has(key)) {
        dailyRevenueMap.set(key, dailyRevenueMap.get(key) + Number(booking.totalAmount));
      }
    }
    const dailyRevenue = Array.from(dailyRevenueMap, ([date, revenue]) => ({ date, revenue }));

    // Breakdown by room — count + revenue per room, sorted highest
    // revenue first so the top performer is immediately visible.
    const roomBreakdownMap = new Map();
    for (const booking of confirmedBookings) {
      const key = booking.roomId ?? "unassigned";
      const label = booking.room?.name ?? "Unassigned / deleted room";
      const existing = roomBreakdownMap.get(key) ?? { roomName: label, bookingCount: 0, revenue: 0 };
      existing.bookingCount += 1;
      existing.revenue += Number(booking.totalAmount);
      roomBreakdownMap.set(key, existing);
    }
    const bookingsByRoom = Array.from(roomBreakdownMap.values()).sort((a, b) => b.revenue - a.revenue);

    // Breakdown by booking type (overnight / day_tour / night_tour)
    const typeBreakdownMap = new Map();
    for (const booking of confirmedBookings) {
      const existing = typeBreakdownMap.get(booking.bookingType) ?? { bookingType: booking.bookingType, count: 0 };
      existing.count += 1;
      typeBreakdownMap.set(booking.bookingType, existing);
    }
    const bookingsByType = Array.from(typeBreakdownMap.values());

    return NextResponse.json({
      success: true,
      data: {
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        totalRevenue,
        confirmedBookingCount: confirmedBookings.length,
        cancelledBookingCount: cancelledBookings.length,
        occupancyRate,
        dailyRevenue,
        bookingsByRoom,
        bookingsByType,
      },
      message: "Report generated successfully.",
    });
  } catch (error) {
    console.error("[reports] Failed to generate report:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to generate the report.", error: error.message },
      { status: 500 }
    );
  }
}
