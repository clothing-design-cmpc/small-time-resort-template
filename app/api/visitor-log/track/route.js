/**
 * FILE: app/api/visitor-log/track/route.js
 * ROLE: Internal only — called by middleware.js, never by the browser directly
 *
 * PURPOSE:
 * Records a single "page_view" VisitorLog row. Exists as its own Node
 * route because middleware.js runs on the Edge runtime, which cannot
 * reach Prisma/Postgres directly (see services/prisma.js) — so
 * middleware fires a non-blocking POST here instead, where a normal
 * Node runtime route handler can write to the DB.
 *
 * DATA FLOW:
 * 1. middleware.js matches a visitor page GET request
 * 2. It calls event.waitUntil(fetch(".../api/visitor-log/track", ...))
 *    without awaiting the response, so it never delays the actual page
 * 3. This route reads the IP/user-agent off ITS OWN request (forwarded
 *    by the same proxy chain) and writes the row
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { logVisitorActivity } from "@/services/visitorLog";

export async function POST(request) {
  try {
    const { path } = await request.json();
    await logVisitorActivity({ request, action: "page_view", path });
    return NextResponse.json({ success: true, data: null, message: "Logged." });
  } catch (error) {
    // Never let a tracking failure surface anywhere — this is best-effort telemetry.
    console.error("[api/visitor-log/track] Failed:", error.message);
    return NextResponse.json({ success: false, data: null, message: "Failed to log." }, { status: 500 });
  }
}
