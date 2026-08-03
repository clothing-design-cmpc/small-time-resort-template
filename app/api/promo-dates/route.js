/**
 * FILE: app/api/promo-dates/route.js
 * ROLE: Public endpoint — no auth required, called by PromoAlertBanner.jsx
 *
 * PURPOSE:
 * Returns every currently-active Promo Date that hasn't passed yet, so
 * the visitor-facing banner can tell guests "5% off Aug 20-22!" without
 * exposing the full super-admin CRUD surface. Deliberately separate
 * from app/api/superAdmin/settings/promo-dates/route.js (that one
 * requires the admin session and returns every entry, past or future,
 * active or not — this one is public and pre-filtered).
 *
 * DATA FLOW:
 * 1. PromoAlertBanner.jsx fetches this on mount on every /visitor page
 * 2. Filters isActive: true AND date >= today (UTC midnight, matching
 *    the same anchor convention the write-side routes already use) so
 *    a past promo never lingers on the banner after its date has gone by
 * 3. Returns the raw list, soonest date first — the banner component
 *    itself groups consecutive dates into a readable range
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";

export async function GET() {
  try {
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
