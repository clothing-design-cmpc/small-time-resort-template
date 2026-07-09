/**
 * FILE: app/api/admin/visitor-logs/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Paginated read of the VisitorLog table for the Visitor Logs admin
 * page — who visited (IP + best-effort city/country), what page, and
 * any notable transaction they completed (e.g. submitting a booking).
 *
 * DATA FLOW:
 * 1. app/superAdmin/(protected)/visitor-logs/VisitorLogsClient.jsx
 *    fetches this on mount and whenever the page/action filter changes
 * 2. requireSuperAdmin() checks the session — this route is never
 *    protected by middleware.js (its matcher only covers page routes)
 * 3. Optional ?action= filters to one action type; otherwise all rows
 *    are returned, newest first
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
  const action = searchParams.get("action");

  try {
    const where = action && action !== "all" ? { action } : {};

    const [logs, totalCount] = await Promise.all([
      prisma.visitorLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.visitorLog.count({ where }),
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
      message: "Visitor logs fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/visitor-logs] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load visitor logs. Please try again." },
      { status: 500 }
    );
  }
}
