/**
 * FILE: app/api/admin/activity-feed/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Unified, newest-first read of VisitorLog + AccountActivityLog together,
 * for the Activity Feed page. This is a *display-level* merge only — the
 * two tables stay separate (different volume, retention, and audit
 * guarantees per Rule 42.1); this route just interleaves them by time so
 * an admin can see "everything that happened" in one timeline, with a
 * filter to narrow to one source.
 *
 * DATA FLOW:
 * 1. ActivityFeedClient fetches this on mount and whenever page/filter changes
 * 2. requireSuperAdmin() checks the session — same as the sibling
 *    account-activity and visitor-logs routes
 * 3. For filter=all, both tables are queried for the top
 *    (page * PAGE_SIZE) rows each, merged, sorted by createdAt desc,
 *    then sliced to the requested page window. This re-fetches the
 *    cumulative set on every page rather than doing true offset
 *    pagination across two sources — acceptable at this site's traffic
 *    volume, and far simpler than a raw SQL UNION.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";

const PAGE_SIZE = 10;

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const filter = searchParams.get("filter") || "all";
  const windowSize = page * PAGE_SIZE;

  try {
    const wantsVisitor = filter === "all" || filter === "visitor";
    const wantsStaff = filter === "all" || filter === "staff";

    const [visitorLogs, visitorCount, staffLogs, staffCount] = await Promise.all([
      wantsVisitor
        ? prisma.visitorLog.findMany({ orderBy: { createdAt: "desc" }, take: windowSize })
        : [],
      wantsVisitor ? prisma.visitorLog.count() : 0,
      wantsStaff
        ? prisma.accountActivityLog.findMany({ orderBy: { createdAt: "desc" }, take: windowSize })
        : [],
      wantsStaff ? prisma.accountActivityLog.count() : 0,
    ]);

    // Resolve staff accountIds to display names, same as the
    // account-activity route — the raw id alone isn't useful in the UI.
    const accountIds = [...new Set(staffLogs.map((log) => log.accountId))];
    const admins = accountIds.length
      ? await prisma.adminProfile.findMany({ where: { id: { in: accountIds } } })
      : [];
    const nameByAccountId = new Map(admins.map((admin) => [admin.id, admin.fullName]));

    // Normalize both sources into one common shape so the client never
    // needs to branch on where a row came from to render it.
    const normalizedVisitorRows = visitorLogs.map((log) => ({
      id: `visitor-${log.id}`,
      source: "visitor",
      actorLabel: "Visitor",
      action: log.action,
      pageOrTarget: log.path || "—",
      location: [log.city, log.country].filter(Boolean).join(", ") || "—",
      ipAddress: log.ipAddress || "—",
      details: log.details || "—",
      createdAt: log.createdAt,
    }));

    const normalizedStaffRows = staffLogs.map((log) => ({
      id: `staff-${log.id}`,
      source: "staff",
      actorLabel: nameByAccountId.get(log.accountId) ?? log.accountId,
      action: log.action,
      pageOrTarget: log.action,
      location: [log.geoCity, log.geoCountry].filter(Boolean).join(", ") || "—",
      ipAddress: log.ipAddress || "—",
      details: log.deviceType || "—",
      createdAt: log.createdAt,
    }));

    const merged = [...normalizedVisitorRows, ...normalizedStaffRows].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    const startIndex = (page - 1) * PAGE_SIZE;
    const pageRows = merged.slice(startIndex, startIndex + PAGE_SIZE);

    const totalCount = filter === "visitor" ? visitorCount : filter === "staff" ? staffCount : visitorCount + staffCount;

    return NextResponse.json({
      success: true,
      data: {
        logs: pageRows,
        page,
        pageSize: PAGE_SIZE,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
      },
      message: "Activity feed fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/activity-feed] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load the activity feed. Please try again." },
      { status: 500 }
    );
  }
}
