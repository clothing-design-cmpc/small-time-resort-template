/**
 * FILE: app/api/admin/ai-insight/regenerate/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin()
 *
 * PURPOSE:
 * Backs the Dashboard's "Regenerate now" button — the plan's hybrid
 * approach (daily automatic cron + manual on-demand override still
 * available, villa-azure-ai-insight-and-directions-plan.txt Part 1's
 * FINAL DECISION). Calls the exact same generateDailyInsight() the
 * cron route uses, just with triggerSource: "manual" so the resulting
 * row is distinguishable in the data.
 *
 * Rate limited per admin session (not per IP, since this is behind
 * auth) to keep an accidental double-click or a bored admin from
 * burning through the Gemini/Weather free-tier allocations.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { generateDailyInsight } from "@/services/aiInsight";
import { checkRateLimit } from "@/services/rateLimit";

const REGENERATE_MAX_ATTEMPTS = 5;
const REGENERATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do that." },
      { status: 401 }
    );
  }

  const { allowed } = await checkRateLimit(`ai-insight-regenerate:${session.uid}`, REGENERATE_MAX_ATTEMPTS, REGENERATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, data: null, message: "You've regenerated the insight too many times recently. Please wait a bit." },
      { status: 429 }
    );
  }

  try {
    const insight = await generateDailyInsight("manual");
    return NextResponse.json({ success: true, data: { insight }, message: "Insight regenerated successfully." });
  } catch (error) {
    console.error("[api/admin/ai-insight/regenerate] Failed to regenerate insight:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to regenerate the insight. Please try again." },
      { status: 500 }
    );
  }
}
