/**
 * FILE: app/api/admin/account-activity/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Paginated read of AccountActivityLog for the Account Activity page —
 * separate from Security Logs (login/attack events) and Analytics
 * (anonymous aggregate traffic), per Rule 42.1's page-separation principle.
 *
 * DATA FLOW:
 * 1. AccountActivityClient fetches this on mount and whenever the page
 *    changes
 * 2. requireSuperAdmin() checks the session
 * 3. Rows are always ordered newest first
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
    const [logs, totalCount] = await Promise.all([
      prisma.accountActivityLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.accountActivityLog.count(),
    ]);

    // Resolve each row's accountId to the admin's display name — the
    // table only stores the raw id, a name lookup is friendlier in the UI.
    const accountIds = [...new Set(logs.map((log) => log.accountId))];
    const admins = accountIds.length
      ? await prisma.adminProfile.findMany({ where: { id: { in: accountIds } } })
      : [];
    const nameByAccountId = new Map(admins.map((admin) => [admin.id, admin.fullName]));

    const logsWithNames = logs.map((log) => ({
      ...log,
      actorName: nameByAccountId.get(log.accountId) ?? log.accountId,
    }));

    return NextResponse.json({
      success: true,
      data: {
        logs: logsWithNames,
        page,
        pageSize: PAGE_SIZE,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
      },
      message: "Account activity fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/account-activity] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load account activity. Please try again." },
      { status: 500 }
    );
  }
}
