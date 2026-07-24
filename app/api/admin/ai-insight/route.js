/**
 * FILE: app/api/admin/ai-insight/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Read-only endpoint backing the Dashboard's AI Sales Insight widget.
 * Just returns the newest AiInsightLog row — no generation happens
 * here (that's app/api/admin/ai-insight/regenerate/route.js and the
 * daily cron). Matches the pattern of
 * app/api/admin/marketing-insights/route.js.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { getLatestInsight } from "@/services/aiInsight";

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

  try {
    const insight = await getLatestInsight();
    return NextResponse.json({ success: true, data: { insight }, message: "Latest AI insight fetched." });
  } catch (error) {
    console.error("[api/admin/ai-insight] Failed to fetch latest insight:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load the latest insight. Please try again." },
      { status: 500 }
    );
  }
}
