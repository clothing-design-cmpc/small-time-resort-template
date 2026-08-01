/**
 * FILE: app/api/admin/weather/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Read-only endpoint backing the Dashboard's Weather Forecast Cache
 * widget. Just returns the current WeatherForecastCache singleton row
 * — no fetching happens here (that's the cron route and
 * app/api/admin/weather/refresh/route.js). Matches the pattern of
 * app/api/admin/ai-insight/route.js.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { prisma } from "@/services/prisma";

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

  try {
    const cache = await prisma.weatherForecastCache.findUnique({ where: { id: "singleton" } });
    return NextResponse.json({ success: true, data: { cache }, message: "Weather cache fetched." });
  } catch (error) {
    console.error("[api/admin/weather] Failed to fetch weather cache:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load the weather cache. Please try again." },
      { status: 500 }
    );
  }
}
