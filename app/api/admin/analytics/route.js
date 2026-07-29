/**
 * FILE: app/api/admin/analytics/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Reads and summarizes PageViewDaily's aggregate counters for the
 * Analytics dashboard — total visits over the last 30 days, top pages,
 * top referrers, and device/country breakdowns. Every value returned
 * here is already an aggregate; no per-visitor data exists to leak.
 * Also folds in Sales Summary and Conversion Rate — both sourced from
 * real Booking rows — so revenue and "visits that turned into a
 * booking" live on the same Analytics page instead of being split
 * across the Dashboard/Marketing Insights sections.
 *
 * DATA FLOW:
 * 1. app/superAdmin/(protected)/analytics/AnalyticsClient.jsx fetches
 *    this on mount
 * 2. requireSuperAdmin() checks the session — this route is never
 *    protected by middleware.js (its matcher only covers page routes)
 * 3. Parallel aggregate queries against PageViewDaily (traffic) and
 *    Booking (sales + conversion), all scoped to the last 30 days
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
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

    const [
      dailyTotals,
      topPages,
      topReferrers,
      deviceBreakdown,
      countryBreakdown,
      totalViewsResult,
      salesBookings,
      confirmedBookingCount,
    ] = await Promise.all([
      // Views per calendar day, for the trend chart.
      prisma.pageViewDaily.groupBy({
        by: ["date"],
        where: { date: { gte: thirtyDaysAgo } },
        _sum: { viewCount: true },
        orderBy: { date: "asc" },
      }),
      // Most-viewed paths.
      prisma.pageViewDaily.groupBy({
        by: ["path"],
        where: { date: { gte: thirtyDaysAgo } },
        _sum: { viewCount: true },
        orderBy: { _sum: { viewCount: "desc" } },
        take: 10,
      }),
      // Top traffic sources (null = direct).
      prisma.pageViewDaily.groupBy({
        by: ["referrerHost"],
        where: { date: { gte: thirtyDaysAgo } },
        _sum: { viewCount: true },
        orderBy: { _sum: { viewCount: "desc" } },
        take: 10,
      }),
      // Device type split.
      prisma.pageViewDaily.groupBy({
        by: ["deviceType"],
        where: { date: { gte: thirtyDaysAgo } },
        _sum: { viewCount: true },
      }),
      // Country-level split.
      prisma.pageViewDaily.groupBy({
        by: ["countryCode"],
        where: { date: { gte: thirtyDaysAgo } },
        _sum: { viewCount: true },
        orderBy: { _sum: { viewCount: "desc" } },
        take: 10,
      }),
      // Grand total for the headline number.
      prisma.pageViewDaily.aggregate({
        where: { date: { gte: thirtyDaysAgo } },
        _sum: { viewCount: true },
      }),
      // Sales Summary — confirmed bookings placed in the last 30 days,
      // used for total revenue, booking count, and average order value.
      prisma.booking.findMany({
        where: { status: "confirmed", createdAt: { gte: thirtyDaysAgo } },
        select: { totalAmount: true },
      }),
      // Conversion Rate — how many of the last 30 days' visits turned
      // into a confirmed booking. Booked-by-createdAt (not check-in
      // date), so it lines up with the same 30-day window as traffic.
      prisma.booking.count({
        where: { status: "confirmed", createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    // --- Sales Summary math ---
    // Decimal fields come back as Prisma.Decimal — convert to Number
    // before summing so the response is plain, JSON-safe numbers.
    const totalRevenue = salesBookings.reduce((sum, booking) => sum + Number(booking.totalAmount), 0);
    const bookingsCount = salesBookings.length;
    const averageOrderValue = bookingsCount === 0 ? 0 : totalRevenue / bookingsCount;

    // --- Conversion Rate math ---
    // Guards against divide-by-zero when there's no traffic yet — an
    // empty analytics table shouldn't produce NaN/Infinity on the page.
    const totalViews = totalViewsResult._sum.viewCount ?? 0;
    const conversionRatePercent =
      totalViews === 0 ? 0 : Math.round((confirmedBookingCount / totalViews) * 1000) / 10; // 1 decimal place

    return NextResponse.json({
      success: true,
      data: {
        totalViews,
        dailyTotals: dailyTotals.map((row) => ({ date: row.date, views: row._sum.viewCount ?? 0 })),
        topPages: topPages.map((row) => ({ path: row.path, views: row._sum.viewCount ?? 0 })),
        topReferrers: topReferrers.map((row) => ({
          referrerHost: row.referrerHost ?? "Direct",
          views: row._sum.viewCount ?? 0,
        })),
        deviceBreakdown: deviceBreakdown.map((row) => ({
          deviceType: row.deviceType ?? "Unknown",
          views: row._sum.viewCount ?? 0,
        })),
        countryBreakdown: countryBreakdown.map((row) => ({
          countryCode: row.countryCode ?? "Unknown",
          views: row._sum.viewCount ?? 0,
        })),
        salesSummary: {
          totalRevenue,
          bookingsCount,
          averageOrderValue,
        },
        conversion: {
          totalViews,
          confirmedBookingCount,
          conversionRatePercent,
        },
      },
      message: "Analytics fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/analytics] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load analytics. Please try again." },
      { status: 500 }
    );
  }
}