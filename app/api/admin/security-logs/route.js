/**
 * FILE: app/api/admin/security-logs/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Paginated read of the append-only SecurityLog table for the Security
 * Logs admin page — login attempts, denied admin access, rate limit
 * hits, and sensitive admin actions (e.g. booking cancellations).
 *
 * DATA FLOW:
 * 1. app/superAdmin/(protected)/security-logs/page.jsx fetches this on
 *    mount and whenever the page/eventType filter changes
 * 2. requireSuperAdmin() checks the session — this route is never
 *    protected by middleware.js (its matcher only covers page routes)
 * 3. Optional ?eventType= filters to one event type; otherwise all
 *    events are returned, newest first
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";

const PAGE_SIZE = 25;

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
  const eventType = searchParams.get("eventType");

  try {
    const where = eventType && eventType !== "all" ? { eventType } : {};

    const [logs, totalCount] = await Promise.all([
      prisma.securityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.securityLog.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        logs,
        page,
        pageSize: PAGE_SIZE,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
      },
      message: "Security logs fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/security-logs] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load security logs. Please try again." },
      { status: 500 }
    );
  }
}
