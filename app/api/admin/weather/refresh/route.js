/**
 * FILE: app/api/admin/weather/refresh/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin()
 *
 * PURPOSE:
 * Manual "Refresh now" override for the weather forecast cache, same
 * hybrid pattern as app/api/admin/ai-insight/regenerate/route.js
 * (automatic cron + admin-triggerable override). Useful for local dev
 * (Vercel Cron never fires on localhost, so this is how the cache gets
 * its first row without waiting for a deploy) and for an admin who
 * wants the homepage widget to reflect a just-changed resort location
 * immediately instead of waiting for the next scheduled cron run.
 *
 * Calls the exact same refreshWeatherForecastCache() the cron route
 * uses — one shared implementation, see services/weather.js.
 *
 * Rate limited per admin session (not per IP, since this is behind
 * auth) to keep an accidental double-click from burning through the
 * Google Weather API free-tier allocation.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { refreshWeatherForecastCache } from "@/services/weather";
import { checkRateLimit } from "@/services/rateLimit";

const REFRESH_MAX_ATTEMPTS = 5;
const REFRESH_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do that." },
      { status: 401 }
    );
  }

  const { allowed } = await checkRateLimit(`weather-refresh:${session.uid}`, REFRESH_MAX_ATTEMPTS, REFRESH_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, data: null, message: "You've refreshed the forecast too many times recently. Please wait a bit." },
      { status: 429 }
    );
  }

  try {
    const result = await refreshWeatherForecastCache();

    if (!result.ok) {
      return NextResponse.json(
        { success: false, data: null, message: "Google Weather API call failed. Please try again shortly." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { days: result.days },
      message: "Weather forecast refreshed successfully.",
    });
  } catch (error) {
    console.error("[api/admin/weather/refresh] Failed to refresh forecast cache:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to refresh the forecast. Please try again." },
      { status: 500 }
    );
  }
}
