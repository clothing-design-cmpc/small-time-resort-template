/**
 * FILE: app/api/cron/promo-cleanup/route.js
 * ROLE: Vercel Cron only — see vercel.json's "crons" array
 *
 * PURPOSE:
 * Permanently deletes every PromoDate row whose date has already
 * passed, so a finished promo (e.g. "Aug 20-22") auto-clears out of
 * the database instead of sitting there forever as dead data the
 * admin has to remember to delete manually from Section 5b.
 *
 * Deliberately a hard delete, not a soft one (contrast with Rule 6's
 * Soft Delete Standard for sensitive records like orders/users) —
 * PromoDate rows carry no guest/financial data worth preserving once
 * their date is gone, and both consumers (the public promo-dates API
 * and the visitor calendar's promo dots) already filter to
 * date >= today, so an expired row has zero remaining purpose.
 *
 * Scheduled once a day (see vercel.json) — promo dates only ever turn
 * "expired" at most once every 24 hours, so there's no need for the
 * 15-minute cadence booking-expiry uses.
 *
 * DATA FLOW:
 * 1. Vercel Cron hits this route on schedule
 * 2. Deletes every PromoDate with date < today (UTC midnight, same
 *    anchor convention app/api/promo-dates/route.js already uses)
 * 3. Logs one summary security event so an admin can see cleanup
 *    activity in Security Logs without a row per deleted promo date
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { logSecurityEvent } from "@/services/securityLog";

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
    const now = new Date();
    const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const { count } = await prisma.promoDate.deleteMany({
      where: { date: { lt: todayUtcMidnight } },
    });

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
