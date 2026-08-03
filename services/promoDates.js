/**
 * FILE: services/promoDates.js
 * PURPOSE:
 * Central helper for deleting expired Promo Dates (super-admin Booking
 * Rules Section 5b). A PromoDate is "expired" the moment its `date`
 * (the actual promo day, not when it was created) has passed.
 *
 * WHY THIS RUNS ON EVERY READ, NOT JUST ON A DAILY CRON:
 * app/api/cron/promo-cleanup/route.js already sweeps this once a day
 * in production via Vercel Cron — but Vercel Cron only fires on a
 * deployed project, never on `localhost`. Calling this same cleanup
 * inline, right before every promo-dates read (the public visitor
 * fetch AND the super-admin list), means an expired promo disappears
 * from the database the very next time ANYONE loads a page that reads
 * PromoDate — no scheduler required, works identically in local dev
 * and production. The daily cron stays in place as a backup for the
 * (rare) case where the site sits with zero traffic for a while.
 *
 * Deliberately a hard delete (see the cron route's header comment for
 * why) — PromoDate rows carry no guest/financial data worth keeping
 * once their date is gone.
 */
import { prisma } from "./prisma.js";

/**
 * cleanupExpiredPromoDates
 * Deletes every PromoDate whose date is before today (UTC midnight —
 * same anchor convention every promo-dates route already uses).
 * Never throws: a failed cleanup should never block the read that
 * triggered it, so callers can fire-and-forget this or await it
 * without needing their own try/catch.
 *
 * @returns {Promise<number>} how many expired rows were deleted
 */
export async function cleanupExpiredPromoDates() {
  try {
    const now = new Date();
    const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const { count } = await prisma.promoDate.deleteMany({
      where: { date: { lt: todayUtcMidnight } },
    });

    return count;
  } catch (error) {
    console.error("[promoDates] Failed to clean up expired promo dates:", error.message);
    return 0;
  }
}
