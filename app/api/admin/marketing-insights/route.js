/**
 * FILE: app/api/admin/marketing-insights/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Read-only endpoint backing the Dashboard's "Marketing Insights"
 * section (Recent Bookings, Top Performing Rooms, Repeat Guest Rate).
 * All computation lives in services/marketingInsights.js — this route
 * only handles auth and the response shape (Rule 28).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { getMarketingInsights } from "@/services/marketingInsights";

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

  try {
    const data = await getMarketingInsights();
    return NextResponse.json({ success: true, data, message: "Marketing insights fetched successfully." });
  } catch (error) {
    console.error("[api/admin/marketing-insights] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load marketing insights. Please try again." },
      { status: 500 }
    );
  }
}
