/**
 * FILE: app/api/admin/analytics/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Reads and summarizes PageViewDaily's aggregate counters for the
 * Analytics dashboard — total visits over the last 30 days, top pages,
 * top referrers, and device/country breakdowns. Every value returned
 * here is already an aggregate; no per-visitor data exists to leak.
 *
 * DATA FLOW:
 * 1. app/superAdmin/(protected)/analytics/AnalyticsClient.jsx fetches
 *    this on mount
 * 2. requireSuperAdmin() checks the session — this route is never
 *    protected by middleware.js (its matcher only covers page routes)
 * 3. Four parallel aggregate queries against PageViewDaily, all scoped
 *    to the last 30 days
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

    const [dailyTotals, topPages, topReferrers, deviceBreakdown, countryBreakdown, totalViewsResult] =
      await Promise.all([
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
      ]);

    return NextResponse.json({
      success: true,
      data: {
        totalViews: totalViewsResult._sum.viewCount ?? 0,
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
