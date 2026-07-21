/**
 * FILE: app/api/admin/dashboard-stats/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Computes the 4 dashboard KPI cards from real Booking data instead of
 * the hardcoded placeholder numbers that used to live in
 * app/superAdmin/(protected)/dashboard/page.jsx. There is no separate
 * "guest account" or "support ticket" table in the schema (guests are
 * plain fields on Booking, and no ticket system exists), so the KPIs
 * are built entirely from what Booking actually tracks:
 *   - Total Guests        -> sum of numberOfGuests, current calendar month
 *   - Active Bookings     -> confirmed bookings whose stay overlaps today
 *   - Monthly Revenue     -> sum of totalAmount, confirmed bookings, current month
 *   - Upcoming Check-ins  -> confirmed bookings checking in within the next 7 days
 * Each KPI also returns a trend percentage versus the equivalent prior
 * period so the StatCard's trend arrow reflects a real comparison.
 *
 * DATA FLOW:
 * 1. hooks/useDashboardStats.js fetches this on mount from the dashboard page
 * 2. requireSuperAdmin() decodes the session cookie — middleware.js's
 *    matcher only covers /superAdmin/* pages, not /api/*
 * 3. Runs parallel Prisma aggregate/count queries scoped to this month
 *    vs last month (and this week vs last week for check-ins)
 * 4. Returns { success, data: { cards: [...] }, message } per Rule 28
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";

/**
 * calculateTrendPercent
 * Compares a current-period value against the prior-period value and
 * returns a rounded percentage change plus a direction, for the
 * StatCard trend arrow. Guards against divide-by-zero when the prior
 * period had no activity at all.
 */
function calculateTrendPercent(currentValue, previousValue) {
  if (previousValue === 0) {
    return { trend: currentValue > 0 ? "100.0%" : "0.0%", trendDirection: currentValue >= 0 ? "up" : "down" };
  }
  const percentChange = ((currentValue - previousValue) / previousValue) * 100;
  return {
    trend: `${Math.abs(percentChange).toFixed(1)}%`,
    trendDirection: percentChange >= 0 ? "up" : "down",
  };
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
    const now = new Date();
    const startOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const sevenDaysFromNow = new Date(startOfToday);
    sevenDaysFromNow.setUTCDate(sevenDaysFromNow.getUTCDate() + 7);
    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

    const [
      guestsThisMonth,
      guestsLastMonth,
      activeBookingsCount,
      activeBookingsLastMonthCount,
      revenueThisMonth,
      revenueLastMonth,
      upcomingCheckIns,
      priorWeekCheckIns,
    ] = await Promise.all([
      // Total Guests — sum of party sizes for bookings made this calendar month
      prisma.booking.aggregate({
        where: { status: "confirmed", createdAt: { gte: startOfThisMonth } },
        _sum: { numberOfGuests: true },
      }),
      prisma.booking.aggregate({
        where: { status: "confirmed", createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
        _sum: { numberOfGuests: true },
      }),
      // Active Bookings — confirmed stays currently in progress (checked in, not yet out)
      prisma.booking.count({
        where: { status: "confirmed", checkInDate: { lte: startOfToday }, checkOutDate: { gte: startOfToday } },
      }),
      // Same measure, one month back, for the trend comparison
      prisma.booking.count({
        where: {
          status: "confirmed",
          checkInDate: { lte: startOfLastMonth },
          checkOutDate: { gte: startOfLastMonth },
        },
      }),
      // Monthly Revenue — confirmed bookings' totalAmount, booked this calendar month
      prisma.booking.aggregate({
        where: { status: "confirmed", createdAt: { gte: startOfThisMonth } },
        _sum: { totalAmount: true },
      }),
      prisma.booking.aggregate({
        where: { status: "confirmed", createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
        _sum: { totalAmount: true },
      }),
      // Upcoming Check-ins — confirmed bookings arriving in the next 7 days
      prisma.booking.count({
        where: { status: "confirmed", checkInDate: { gte: startOfToday, lt: sevenDaysFromNow } },
      }),
      // Same measure, the prior 7-day window, for the trend comparison
      prisma.booking.count({
        where: { status: "confirmed", checkInDate: { gte: sevenDaysAgo, lt: startOfToday } },
      }),
    ]);

    const totalGuestsValue = guestsThisMonth._sum.numberOfGuests ?? 0;
    const totalGuestsPrevValue = guestsLastMonth._sum.numberOfGuests ?? 0;

    const monthlyRevenueValue = Number(revenueThisMonth._sum.totalAmount ?? 0);
    const monthlyRevenuePrevValue = Number(revenueLastMonth._sum.totalAmount ?? 0);

    const cards = [
      {
        id: "totalGuests",
        label: "Total Guests",
        value: totalGuestsValue.toLocaleString("en-US"),
        ...calculateTrendPercent(totalGuestsValue, totalGuestsPrevValue),
      },
      {
        id: "activeBookings",
        label: "Active Bookings",
        value: activeBookingsCount.toLocaleString("en-US"),
        ...calculateTrendPercent(activeBookingsCount, activeBookingsLastMonthCount),
      },
      {
        id: "monthlyRevenue",
        label: "Monthly Revenue",
        value: `₱${monthlyRevenueValue.toLocaleString("en-US", { minimumFractionDigits: 0 })}`,
        ...calculateTrendPercent(monthlyRevenueValue, monthlyRevenuePrevValue),
      },
      {
        id: "upcomingCheckIns",
        label: "Upcoming Check-ins (7 Days)",
        value: upcomingCheckIns.toLocaleString("en-US"),
        ...calculateTrendPercent(upcomingCheckIns, priorWeekCheckIns),
      },
    ];

    return NextResponse.json({
      success: true,
      data: { cards },
      message: "Dashboard stats fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/dashboard-stats] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load dashboard stats. Please try again." },
      { status: 500 }
    );
  }
}
