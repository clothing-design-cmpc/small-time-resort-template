/**
 * FILE: app/api/admin/backup-logs/trigger/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Powers the "Run Backup Now" button on the Backups page. Does NOT run
 * pg_dump itself — it remotely presses the "Run workflow" button on
 * .github/workflows/database-backup.yml via the GitHub API
 * (workflow_dispatch), so the actual backup still only ever runs on
 * GitHub's own runners (Rule 40.1 — DB-heavy work stays off the live
 * request cycle). The new row this produces appears on the Backups
 * page a few seconds later, written by scripts/runBackup.js itself.
 *
 * DATA FLOW:
 * 1. Admin clicks "Run Backup Now" in BackupLogsClient
 * 2. This route verifies the session, then calls
 *    triggerWorkflowDispatch("database-backup.yml", {})
 * 3. Logs a security event so the manual trigger shows up in the
 *    audit trail (who ran it, when)
 * 4. Returns success immediately — the admin refreshes the list a
 *    little later to see the new row once the workflow finishes
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { triggerWorkflowDispatch } from "@/services/github";
import { logSecurityEvent } from "@/services/securityLog";

export async function POST(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    await triggerWorkflowDispatch("database-backup.yml", {});

    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: "Manually triggered a database backup from the Backups page.",
    });

    return NextResponse.json({
      success: true,
      data: null,
      message: "Backup started. It usually finishes within a minute — refresh the list to see it.",
    });
  } catch (error) {
    console.error("[api/admin/backup-logs/trigger] Failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't start the backup. Please try again." },
      { status: 500 }
    );
  }
}
