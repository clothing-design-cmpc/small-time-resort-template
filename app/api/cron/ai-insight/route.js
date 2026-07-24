/**
 * FILE: app/api/cron/ai-insight/route.js
 * ROLE: Cron-only — never called by a browser, never linked anywhere.
 *       Authenticated by a shared CRON_SECRET, same pattern as
 *       app/api/system-vault-setup/auto-rotate/route.js — there's no
 *       admin session cookie in a scheduled job, so this route has its
 *       own single gate instead of requireSuperAdmin().
 *
 * PURPOSE:
 * Runs once a day (see vercel.json's crons entry, 6:00 AM Asia/Manila =
 * 22:00 UTC) and generates the Dashboard's AI Sales Insight
 * (villa-azure-ai-insight-and-directions-plan.txt, Part 1's FINAL
 * DECISION — automatic daily, not click-only). All the actual work
 * (pulling sales data, fetching weather, prompting Gemini, saving the
 * row) lives in services/aiInsight.js's generateDailyInsight() — this
 * route only handles cron auth and the response shape.
 *
 * DATA FLOW:
 * 1. Vercel Cron hits this route with "Authorization: Bearer <CRON_SECRET>"
 * 2. Header missing/wrong -> 401, nothing runs
 * 3. generateDailyInsight("cron") -> always writes one AiInsightLog row,
 *    even on a Gemini failure (status: "error"), so a failed run is
 *    still visible on the Dashboard/history instead of vanishing
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { generateDailyInsight } from "@/services/aiInsight";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, data: null, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const insight = await generateDailyInsight("cron");
    return NextResponse.json({
      success: true,
      data: { id: insight.id, status: insight.status, severity: insight.severity },
      message: "Daily AI insight generated.",
    });
  } catch (error) {
    console.error("[cron/ai-insight] Failed to generate daily insight:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to generate daily insight." },
      { status: 500 }
    );
  }
}
