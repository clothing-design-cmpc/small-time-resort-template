/**
 * FILE: app/api/admin/security-logs/geo-summary/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Aggregates SecurityLog rows by country for two consumers on the
 * Security Logs page: the Geo Heatmap (event count per country) and
 * the Country filter dropdown (distinct country list). Combined into
 * one endpoint since both need the same underlying groupBy query.
 *
 * DATA FLOW:
 * 1. SecurityLogsClient fetches this once on mount (independent of the
 *    eventType/deviceType/country/page filters — the heatmap always
 *    reflects the full log history, not the currently filtered view)
 * 2. requireSuperAdmin() checks the session — never protected by
 *    middleware.js (its matcher only covers page routes)
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";

// Caps how many rows the heatmap renders — a long tail of one-off
// countries would just push the bars for the meaningful ones off screen.
const MAX_HEATMAP_COUNTRIES = 12;

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

  try {
    const grouped = await prisma.securityLog.groupBy({
      by: ["country", "countryCode"],
      where: { country: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
    });

    const countryCounts = grouped.map((row) => ({
      country: row.country,
      countryCode: row.countryCode,
      count: row._count._all,
    }));

    return NextResponse.json({
      success: true,
      data: {
        // Sorted, capped list for the heatmap bars.
        heatmap: countryCounts.slice(0, MAX_HEATMAP_COUNTRIES),
        // Full alphabetical list for the Country filter dropdown.
        countries: [...countryCounts].map((row) => row.country).sort((a, b) => a.localeCompare(b)),
      },
      message: "Geo summary fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/security-logs/geo-summary] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load geo summary. Please try again." },
      { status: 500 }
    );
  }
}
