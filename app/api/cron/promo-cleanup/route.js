/**
 * FILE: app/api/cron/promo-cleanup/route.js
 * ROLE: Vercel Cron only — see vercel.json's "crons" array
 *
 * PURPOSE:
 * Backup sweep for expired Promo Dates. The actual deletion logic
 * lives in services/promoDates.js -> cleanupExpiredPromoDates(), which
 * ALSO runs inline on every GET to /api/promo-dates and
 * /api/superAdmin/settings/promo-dates — that inline call is what
 * makes cleanup work in local dev (Vercel Cron only fires on a
 * deployed project). This route exists so a promo still gets cleared
 * out even if the site sits with zero page loads for a while.
 *
 * Scheduled once a day (see vercel.json) — promo dates only ever turn
 * "expired" at most once every 24 hours, so there's no need for the
 * 15-minute cadence booking-expiry uses.
 *
 * DATA FLOW:
 * 1. Vercel Cron hits this route on schedule
 * 2. Calls cleanupExpiredPromoDates() — same hard-delete logic the
 *    inline read-path calls use
 * 3. Logs one summary security event so an admin can see cleanup
 *    activity in Security Logs without a row per deleted promo date
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { logSecurityEvent } from "@/services/securityLog";
import { cleanupExpiredPromoDates } from "@/services/promoDates";

export async function GET(request) {
  // Vercel Cron requests carry this header — reject anything else so
  // this route can't be hit and abused as a public "wipe promos"
  // trigger (Rule 32.1's spirit, applied to a cron-only endpoint).
  const isVercelCron = request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (process.env.CRON_SECRET && !isVercelCron) {
    return NextResponse.json(
      { success: false, data: null, message: "Not authorized." },
      { status: 401 }
    );
  }

  try {
    const count = await cleanupExpiredPromoDates();

    if (count > 0) {
      await logSecurityEvent({
        eventType: "admin_action",
        actor: "system:promo-cleanup-cron",
        request: null,
        details: `Auto-removed ${count} expired promo date(s) from the database.`,
      });
    }

    return NextResponse.json({
      success: true,
      data: { deletedCount: count },
      message: `Removed ${count} expired promo date(s).`,
    });
  } catch (error) {
    console.error("[api/cron/promo-cleanup] Failed to clean up expired promo dates:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to clean up expired promo dates." },
      { status: 500 }
    );
  }
}
