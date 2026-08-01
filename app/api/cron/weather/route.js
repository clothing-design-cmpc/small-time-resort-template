/**
 * FILE: app/api/cron/weather/route.js
 * ROLE: Cron-only — never called by a browser, never linked anywhere.
 *       Authenticated by the shared CRON_SECRET, same pattern as
 *       app/api/cron/ai-insight/route.js.
 *
 * PURPOSE:
 * Runs 3x/day (see vercel.json's crons entries — 5:00 AM, 12:00 PM,
 * and 8:00 PM Asia/Manila) and refreshes the cached forecast the
 * visitor homepage widget (WeatherForecastSection.jsx) reads. The
 * widget itself NEVER calls Google directly — it only reads the
 * WeatherForecastCache singleton row this route writes, which keeps
 * every page load free and instant regardless of Google Weather API's
 * own latency or (free-tier) quota.
 *
 * Why 3x/day instead of live-per-request: Google Weather API's free
 * tier is 10,000 calls/month — 3 calls/day (~90/month) leaves huge
 * headroom, but a resort's forecast genuinely doesn't need to be
 * fresher than a few hours old for a guest deciding whether to book.
 *
 * DATA FLOW:
 * 1. Vercel Cron hits this route with "Authorization: Bearer <CRON_SECRET>"
 * 2. Header missing/wrong -> 401, nothing runs
 * 3. Reads resort coordinates off the SystemSettings singleton row
 *    (same fields ResortLocationWidget.jsx reads)
 * 4. Calls getVisitorWeatherForecast() -> upserts WeatherForecastCache
 * 5. On a failed Google call, the previous cached row is left as-is
 *    (status flips to "error" only if there's no previous data at
 *    all) so a single bad cron run never blanks out a working widget
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { getVisitorWeatherForecast } from "@/services/weather";

// Same placeholder Metro Manila coordinates every other resort-location
// consumer (Footer.jsx, ResortLocationWidget.jsx) falls back to.
const PLACEHOLDER_LATITUDE = 14.5995;
const PLACEHOLDER_LONGITUDE = 120.9842;

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, data: null, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: "singleton" } }).catch(() => null);
    const latitude = settings?.resortLatitude ?? PLACEHOLDER_LATITUDE;
    const longitude = settings?.resortLongitude ?? PLACEHOLDER_LONGITUDE;

    const forecastDays = await getVisitorWeatherForecast(latitude, longitude);

    if (!forecastDays) {
      // Google call failed — only mark the cache "error" if there was
      // never a successful row before; otherwise leave the last good
      // forecast in place so the widget doesn't go blank over one
      // missed refresh.
      const existing = await prisma.weatherForecastCache.findUnique({ where: { id: "singleton" } }).catch(() => null);
      if (!existing) {
        await prisma.weatherForecastCache.upsert({
          where: { id: "singleton" },
          create: { id: "singleton", forecastDays: null, status: "error" },
          update: { status: "error" },
        });
      }
      return NextResponse.json(
        { success: false, data: null, message: "Google Weather API call failed; kept previous cache." },
        { status: 502 }
      );
    }

    await prisma.weatherForecastCache.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", forecastDays, status: "ok" },
      update: { forecastDays, status: "ok" },
    });

    return NextResponse.json({
      success: true,
      data: { days: forecastDays.length },
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
