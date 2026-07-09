/**
 * FILE: app/api/analytics/track/route.js
 * ROLE: Public — no auth required, called by every visitor's browser
 *
 * PURPOSE:
 * Receives a page-view beacon from components/shared/AnalyticsBeacon.jsx
 * and records it via services/analytics.js. Never stores or returns the
 * visitor's IP or any other individually-identifying value (Rule 41).
 *
 * DATA FLOW:
 * 1. AnalyticsBeacon.jsx fires this POST on every route change
 * 2. requestJson gives { path, referrerHost }
 * 3. recordPageView() resolves country/device in-memory and upserts the
 *    aggregate counter row — see services/analytics.js
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { recordPageView } from "@/services/analytics";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const path = typeof body.path === "string" && body.path.length > 0 ? body.path.slice(0, 200) : "/";
    const referrerHost =
      typeof body.referrerHost === "string" && body.referrerHost.length > 0
        ? body.referrerHost.slice(0, 200)
        : null;

    await recordPageView({ request, path, referrerHost });

    return NextResponse.json({ success: true, data: null, message: "Recorded." });
  } catch (error) {
    // Analytics failures must never surface as a broken experience — log
    // server-side only and still return success so the beacon doesn't retry-loop.
    console.error("[api/analytics/track] Failed:", error.message);
    return NextResponse.json({ success: true, data: null, message: "Recorded." });
  }
}
