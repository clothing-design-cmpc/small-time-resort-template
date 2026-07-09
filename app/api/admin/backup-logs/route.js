/**
 * FILE: app/api/admin/backup-logs/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Read-only, paginated view of BackupLog rows for the Backups admin
 * page (Rule 40.6). Strictly GET-only — there is no POST here on
 * purpose. Triggering a backup from this app would reintroduce backup
 * work into the live request cycle, which Rule 40.1 forbids; on-demand
 * backups are run through GitHub Actions' own "Run workflow" button
 * (workflow_dispatch in .github/workflows/database-backup.yml), never
 * through this API.
 *
 * DATA FLOW:
 * 1. app/superAdmin/(protected)/backups/page.jsx fetches this on mount
 *    and whenever the page changes
 * 2. requireSuperAdmin() checks the session — this route is never
 *    protected by middleware.js (its matcher only covers page routes)
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

  try {
    const [backupLogs, totalCount] = await Promise.all([
      prisma.backupLog.findMany({
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.backupLog.count(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        backupLogs,
        page,
        pageSize: PAGE_SIZE,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
      },
      message: "Backup logs fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/backup-logs] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load backup history. Please try again." },
      { status: 500 }
    );
  }
}
