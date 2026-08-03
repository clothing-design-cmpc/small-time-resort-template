/**
 * FILE: app/api/promo-dates/route.js
 * ROLE: Public endpoint — no auth required, called by PromoAlertBanner.jsx
 *
 * PURPOSE:
 * Returns every currently-active Promo Date that hasn't passed yet, so
 * the visitor-facing banner can tell guests "5% off Aug 20-22!" without
 * exposing the full super-admin CRUD surface. Also fetched by
 * HowToBookSection.jsx to flag promo dates directly on the calendar.
 * Deliberately separate from app/api/superAdmin/settings/promo-dates/
 * route.js (that one requires the admin session and returns every
 * entry, past or future, active or not — this one is public and
 * pre-filtered).
 *
 * DATA FLOW:
 * 1. PromoAlertBanner.jsx and HowToBookSection.jsx both fetch this on
 *    mount on every /visitor page
 * 2. cleanupExpiredPromoDates() (services/promoDates.js) runs first,
 *    hard-deleting any PromoDate whose date has already passed — see
 *    that file's header for why this happens here rather than relying
 *    solely on the daily app/api/cron/promo-cleanup cron job
 * 3. Filters isActive: true AND date >= today (UTC midnight, matching
 *    the same anchor convention the write-side routes already use) so
 *    a past promo never lingers after its date has gone by
 * 4. Returns the raw list, soonest date first — callers group/format
 *    it themselves (PromoAlertBanner clusters into ranges; the
 *    calendar keys it by date)
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { cleanupExpiredPromoDates } from "@/services/promoDates";

export async function GET() {
  try {
    // Purge any promo whose date has already passed before reading —
    // see services/promoDates.js for why this runs here instead of
    // relying on the daily cron alone (works in local dev too).
    await cleanupExpiredPromoDates();

    const now = new Date();
    const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const promoDates = await prisma.promoDate.findMany({
      where: { isActive: true, date: { gte: todayUtcMidnight } },
      select: { date: true, discountPercent: true, label: true, appliesTo: true },
      orderBy: { date: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: promoDates,
      message: "Promo dates fetched successfully.",
    });
  } catch (error) {
    console.error("[api/promo-dates] Failed to fetch promo dates:", error.message);
    // Fails to an empty list rather than a 500 — a broken promo lookup
    // must never be the reason the homepage itself looks broken; the
    // banner component simply renders nothing when data is empty.
    return NextResponse.json({
      success: true,
      data: [],
      message: "Promo dates fetched successfully.",
    });
  }
}
