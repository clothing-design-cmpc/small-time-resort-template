/**
 * FILE: app/api/cron/weather/route.js
 * ROLE: Cron-only — never called by a browser, never linked anywhere.
 *       Authenticated by the shared CRON_SECRET, same pattern as
 *       app/api/cron/ai-insight/route.js.
 *
 * PURPOSE:
 * Runs every 5 hours around the clock (see vercel.json's crons entry
 * — "0 */5 * * *", UTC-based) and refreshes the cached forecast the
 * visitor homepage widget (WeatherForecastSection.jsx) reads. All the
 * actual work (coordinates lookup, Google API call, cache upsert)
 * lives in services/weather.js's refreshWeatherForecastCache() — this
 * route only handles cron auth and the response shape, same split
 * app/api/cron/ai-insight/route.js uses for generateDailyInsight().
 *
 * Vercel Cron never fires on localhost — during local dev, hit this
 * same route manually once to populate the cache:
 *   curl -H "Authorization: Bearer <your CRON_SECRET>" http://localhost:3000/api/cron/weather
 * Or use the super-admin "Refresh now" route instead (no CRON_SECRET
 * needed, just a logged-in admin session) — see
 * app/api/admin/weather/refresh/route.js.
 *
 * DATA FLOW:
 * 1. Vercel Cron hits this route with "Authorization: Bearer <CRON_SECRET>"
 * 2. Header missing/wrong -> 401, nothing runs
 * 3. refreshWeatherForecastCache() -> reads resort coordinates off
 *    SystemSettings, calls Google Weather API, upserts
 *    WeatherForecastCache
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { refreshWeatherForecastCache } from "@/services/weather";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, data: null, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await refreshWeatherForecastCache();

    if (!result.ok) {
      return NextResponse.json(
        { success: false, data: null, message: "Google Weather API call failed; kept previous cache." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { days: result.days },
      message: "Weather forecast cache refreshed.",
    });
  } catch (error) {
    console.error("[cron/weather] Failed to refresh forecast cache:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to refresh weather forecast." },
      { status: 500 }
    );
  }
}
