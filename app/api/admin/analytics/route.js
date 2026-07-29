/**
 * FILE: app/api/admin/analytics/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Reads and summarizes PageViewDaily's aggregate counters for the
 * Analytics dashboard — total visits over the last 30 days, top pages,
 * top referrers, device breakdown, and a specific city-level location
 * breakdown. Every value returned here is already an aggregate; no
 * per-visitor data exists to leak.
 * Also folds in five Booking-sourced metrics, each paired with its own
 * daily trend series for the card+chart layout on the Analytics page:
 * Total Revenue, Lost Revenue (cancelled bookings), Rebookings (repeat
 * guests), Cancelled Bookings, and Conversion Rate.
 *
 * DATA FLOW:
 * 1. app/superAdmin/(protected)/analytics/AnalyticsClient.jsx fetches
 *    this on mount
 * 2. requireSuperAdmin() checks the session — this route is never
 *    protected by middleware.js (its matcher only covers page routes)
 * 3. Traffic aggregates come straight from PageViewDaily groupBy
 *    queries. Booking-sourced metrics are computed in-memory from a
 *    single 30-day Booking fetch (bucketed per day here) plus one
 *    all-time lookup of repeat-guest emails, since Prisma has no
 *    portable "group by day" for a DateTime column without raw SQL.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";

/**
 * toDateKey
 * Truncates a Date to a UTC "YYYY-MM-DD" string so bookings and page
 * views can be bucketed into the same daily key regardless of the
 * time-of-day each row was created.
 */
function toDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * buildDailySeries
 * Produces one entry per calendar day between startDate and today
 * (inclusive), filling in zero for any day with no data. Keeps every
 * paired chart showing the full 30-day window instead of only the
 * days that happened to have activity.
 */
function buildDailySeries(startDate, valueByDateKey) {
  const series = [];
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const today = new Date();
  const endKey = toDateKey(today);

  while (toDateKey(cursor) <= endKey) {
    const key = toDateKey(cursor);
    series.push({ date: key, value: valueByDateKey.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return series;
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
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

    const [
      dailyTotals,
      topPages,
      topReferrers,
      deviceBreakdown,
      locationBreakdown,
      totalViewsResult,
      windowBookings,
      allTimeConfirmedGuestCounts,
    ] = await Promise.all([
      // Views per calendar day, for the Daily Views trend chart.
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
      // Specific, accurate location split — city + country together
      // (not country-only), so an admin can read exactly where
      // traffic is coming from at a glance.
      prisma.pageViewDaily.groupBy({
        by: ["countryCode", "geoCity"],
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
      // Every booking (any status) created in the last 30 days — bucketed
      // in-memory below into Revenue / Lost Revenue / Cancelled / daily
      // Conversion Rate, all sharing this one query instead of five.
      prisma.booking.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { status: true, totalAmount: true, createdAt: true, guestEmail: true },
      }),
      // All-time confirmed booking count per guest, used only to detect
      // which guests are repeat bookers (Rebookings metric) — a guest's
      // very first booking should never count as a "rebooking".
      prisma.booking.groupBy({
        by: ["guestEmail"],
        where: { status: "confirmed", guestEmail: { not: "" } },
        _count: { _all: true },
      }),
    ]);

    const totalViews = totalViewsResult._sum.viewCount ?? 0;

    /**
     * mergeByLabel
     * Some legacy rows store the literal string "Unknown"/"Direct" while
     * newer rows store null for the same missing value. Prisma's groupBy
     * treats null and the literal string as separate DB groups, so after
     * the ?? fallback below two rows can collapse onto the same label —
     * causing duplicate React keys and split view counts. This re-merges
     * rows that share a label after the fallback is applied.
     */
    function mergeByLabel(rows, buildLabel, getViews) {
      const merged = new Map();
      for (const row of rows) {
        const label = buildLabel(row);
        merged.set(label, (merged.get(label) ?? 0) + getViews(row));
      }
      return Array.from(merged, ([label, views]) => ({ label, views })).sort((a, b) => b.views - a.views);
    }

    // --- Daily Views series (for the redesigned trend chart) ---
    const dailyViewsByDate = new Map(dailyTotals.map((row) => [toDateKey(row.date), row._sum.viewCount ?? 0]));
    const dailyViewsSeries = buildDailySeries(thirtyDaysAgo, dailyViewsByDate);

    // --- Repeat-guest lookup (all-time), used to classify a booking as a rebooking ---
    const repeatGuestEmails = new Set(
      allTimeConfirmedGuestCounts.filter((row) => row._count._all >= 2).map((row) => row.guestEmail)
    );

    // --- Bucket the 30-day booking list into per-metric daily maps in one pass ---
    const revenueByDate = new Map();
    const lostRevenueByDate = new Map();
    const rebookingsByDate = new Map();
    const cancelledByDate = new Map();
    const confirmedCountByDate = new Map();

    let totalRevenue = 0;
    let lostRevenue = 0;
    let bookingsCount = 0;
    let cancelBookingsCount = 0;
    let rebookingsCount = 0;

    for (const booking of windowBookings) {
      const dateKey = toDateKey(booking.createdAt);
      const amount = Number(booking.totalAmount);

      if (booking.status === "confirmed") {
        totalRevenue += amount;
        bookingsCount += 1;
        revenueByDate.set(dateKey, (revenueByDate.get(dateKey) ?? 0) + amount);
        confirmedCountByDate.set(dateKey, (confirmedCountByDate.get(dateKey) ?? 0) + 1);

        if (booking.guestEmail && repeatGuestEmails.has(booking.guestEmail)) {
          rebookingsCount += 1;
          rebookingsByDate.set(dateKey, (rebookingsByDate.get(dateKey) ?? 0) + 1);
        }
      } else if (booking.status === "cancelled") {
        lostRevenue += amount;
        cancelBookingsCount += 1;
        lostRevenueByDate.set(dateKey, (lostRevenueByDate.get(dateKey) ?? 0) + amount);
        cancelledByDate.set(dateKey, (cancelledByDate.get(dateKey) ?? 0) + 1);
      }
    }

    const averageOrderValue = bookingsCount === 0 ? 0 : totalRevenue / bookingsCount;

    // --- Conversion Rate: overall + a daily series (confirmed bookings ÷ views, per day) ---
    const conversionRatePercent = totalViews === 0 ? 0 : Math.round((bookingsCount / totalViews) * 1000) / 10;
    const conversionByDate = new Map();
    for (const { date, value: views } of dailyViewsSeries) {
      const confirmed = confirmedCountByDate.get(date) ?? 0;
      conversionByDate.set(date, views === 0 ? 0 : Math.round((confirmed / views) * 1000) / 10);
    }

    return NextResponse.json({
      success: true,
      data: {
        totalViews,
        dailyTotals: dailyViewsSeries.map((row) => ({ date: row.date, views: row.value })),
        topPages: topPages.map((row) => ({ path: row.path, views: row._sum.viewCount ?? 0 })),
        topReferrers: mergeByLabel(
          topReferrers,
          (row) => row.referrerHost ?? "Direct",
          (row) => row._sum.viewCount ?? 0
        ).map((row) => ({ referrerHost: row.label, views: row.views })),
        deviceBreakdown: mergeByLabel(
          deviceBreakdown,
          (row) => row.deviceType ?? "Unknown",
          (row) => row._sum.viewCount ?? 0
        ).map((row) => ({ deviceType: row.label, views: row.views })),
        // Specific city + country per row, e.g. { city: "Imus", countryCode: "PH" }
        // — replaces the old country-only breakdown so location is fast to read.
        // Rows are merged by their final "city, country" label (see mergeByLabel
        // above) so a null-vs-"Unknown" split in the raw data never produces two
        // rows with the same rendered key.
        locationBreakdown: mergeByLabel(
          locationBreakdown,
          (row) => `${row.geoCity ?? "Unknown"}|||${row.countryCode ?? "Unknown"}`,
          (row) => row._sum.viewCount ?? 0
        ).map((row) => {
          const [city, countryCode] = row.label.split("|||");
          return { city, countryCode, views: row.views };
        }),

        salesSummary: {
          totalRevenue,
          bookingsCount,
          averageOrderValue,
          dailySeries: buildDailySeries(thirtyDaysAgo, revenueByDate).map((row) => ({
            date: row.date,
            value: row.value,
          })),
        },
        lostRevenueSummary: {
          lostRevenue,
          cancelBookingsCount,
          dailySeries: buildDailySeries(thirtyDaysAgo, lostRevenueByDate).map((row) => ({
            date: row.date,
            value: row.value,
          })),
        },
        rebookingSummary: {
          rebookingsCount,
          repeatGuestCount: repeatGuestEmails.size,
          dailySeries: buildDailySeries(thirtyDaysAgo, rebookingsByDate).map((row) => ({
            date: row.date,
            value: row.value,
          })),
        },
        cancelSummary: {
          cancelBookingsCount,
          dailySeries: buildDailySeries(thirtyDaysAgo, cancelledByDate).map((row) => ({
            date: row.date,
            value: row.value,
          })),
        },
        conversion: {
          totalViews,
          confirmedBookingCount: bookingsCount,
          conversionRatePercent,
          dailySeries: buildDailySeries(thirtyDaysAgo, conversionByDate).map((row) => ({
            date: row.date,
            value: row.value,
          })),
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