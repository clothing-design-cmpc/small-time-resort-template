/**
 * FILE: app/api/admin/email-logs/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Read-only, paginated, filterable view of EmailLog rows for the Email
 * Logs admin page (Task 1 — detect sent/failed emails). Every row was
 * written automatically by services/emailLogs.js's recordEmailAttempt()
 * from inside services/emailjs.js's sendGeneralEmail() — this route
 * never writes, it only reads.
 *
 * DATA FLOW:
 * 1. app/superAdmin/(protected)/email-logs/EmailLogsClient.jsx fetches
 *    this on mount, on page change, and whenever a status/type filter
 *    changes
 * 2. requireSuperAdmin() checks the session — this route is never
 *    protected by middleware.js (its matcher only covers page routes)
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { listEmailLogs } from "@/services/emailLogs";

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
  // "" from an "All statuses" / "All types" <select> is treated the
  // same as not filtering at all — only a real value narrows the query.
  const status = searchParams.get("status") || null;
  const emailType = searchParams.get("emailType") || null;

  try {
    const result = await listEmailLogs({ page, status, emailType });

    return NextResponse.json({
      success: true,
      data: result,
      message: "Email logs fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/email-logs] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load email logs. Please try again." },
      { status: 500 }
    );
  }
}
