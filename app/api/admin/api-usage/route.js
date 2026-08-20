/**
 * FILE: app/api/admin/api-usage/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Read-only aggregation of ApiCallLog rows for the API Usage page.
 * Groups the raw per-call rows written by services/apiUsageTracker.js
 * into per-service counters (today / last 7 days / last 30 days,
 * success vs. failed, most recent call) so the page never has to fetch
 * or render individual rows — this app can only ever report how many
 * calls IT made, never the provider's own authoritative quota number,
 * which is why every card also carries a dashboardUrl link.
 *
 * Also computes a per-service healthStatus ("healthy" | "degraded" |
 * "down") from the most recent calls, not just a buried 30-day failed
 * count — a raw failedCount treats "1 failure three weeks ago" the
 * same as "the last 5 calls all failed just now", which is the
 * distinction that actually matters for "is there a problem right
 * now". See computeHealthStatus() below for the exact rule.
 *
 * DATA FLOW:
 * 1. app/superAdmin/(protected)/api-usage/ApiUsageClient.jsx fetches
 *    this on mount
 * 2. requireSuperAdmin() checks the session — this route is never
 *    protected by middleware.js (its matcher only covers page routes)
 * 3. One query pulls every ApiCallLog row from the last 30 days, then
 *    the counters (and health status) are reduced in JS per service —
 *    cheaper than separate COUNT queries per service x window for a
 *    table this low-volume.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { API_CATALOG } from "@/services/apiUsageTracker";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// How many of the most recent calls to look at when deciding whether
// an API currently has a problem — deliberately small so a real
// outage is flagged fast, without needing a full day of bad calls.
const RECENT_WINDOW_SIZE = 5;

/**
 * computeHealthStatus
 * Looks at only the most recent calls (newest first, already sliced
 * to RECENT_WINDOW_SIZE by the caller) and returns:
 *   "down"     - no calls logged yet ever, but that's "unknown", not
 *                covered here (caller handles the zero-calls case) —
 *                OR the most recent call failed AND at least half of
 *                the recent window also failed (a real, current
 *                pattern, not one blip).
 *   "degraded" - the most recent call succeeded, but at least one
 *                call in the recent window failed — worth a look, not
 *                yet an emergency.
 *   "healthy"  - every call in the recent window succeeded.
 */
function computeHealthStatus(recentOutcomesNewestFirst) {
  if (recentOutcomesNewestFirst.length === 0) return "unknown";

  const mostRecentFailed = recentOutcomesNewestFirst[0] === false;
  const failuresInWindow = recentOutcomesNewestFirst.filter((success) => success === false).length;

  if (mostRecentFailed && failuresInWindow >= Math.ceil(recentOutcomesNewestFirst.length / 2)) {
    return "down";
  }
  if (failuresInWindow > 0) return "degraded";
  return "healthy";
}

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);

    const recentLogs = await prisma.apiCallLog.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { service: true, success: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    // Seed one counter bucket per catalog entry so every known API
    // shows a card even if it has zero calls yet — never only the
    // services that happen to have rows.
    const counters = {};
    const recentOutcomesByService = {};
    for (const serviceKey of Object.keys(API_CATALOG)) {
      counters[serviceKey] = {
        service: serviceKey,
        ...API_CATALOG[serviceKey],
        todayCount: 0,
        last7DaysCount: 0,
        last30DaysCount: 0,
        failedCount: 0,
        lastCallAt: null,
        healthStatus: "unknown",
      };
      recentOutcomesByService[serviceKey] = [];
    }

    for (const log of recentLogs) {
      const bucket = counters[log.service];
      if (!bucket) continue; // a row for a service key no longer in the catalog — skip, never crash

      bucket.last30DaysCount += 1;
      if (log.createdAt >= sevenDaysAgo) bucket.last7DaysCount += 1;
      if (log.createdAt >= startOfToday) bucket.todayCount += 1;
      if (!log.success) bucket.failedCount += 1;
      if (!bucket.lastCallAt || log.createdAt > bucket.lastCallAt) {
        bucket.lastCallAt = log.createdAt;
      }

      // recentLogs is already newest-first (orderBy createdAt desc), so
      // the first RECENT_WINDOW_SIZE entries seen per service are
      // exactly its most recent calls — no separate sort needed.
      const outcomes = recentOutcomesByService[log.service];
      if (outcomes.length < RECENT_WINDOW_SIZE) outcomes.push(log.success);
    }

    for (const serviceKey of Object.keys(counters)) {
      counters[serviceKey].healthStatus = computeHealthStatus(recentOutcomesByService[serviceKey]);
    }

    return NextResponse.json({
      success: true,
      data: { services: Object.values(counters) },
      message: "API usage fetched successfully.",
    });
  } catch (error) {
    console.error("[api-usage] Failed to load usage:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load API usage.", error: error.message },
      { status: 500 }
    );
  }
}
