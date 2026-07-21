/**
 * FILE: app/api/admin/backup-logs/trigger/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Powers the "Run Backup Now" button on the Backups page. Does NOT run
 * pg_dump itself — it remotely presses the "Run workflow" button on
 * .github/workflows/manual-database-backup.yml via the GitHub API
 * (workflow_dispatch), so the actual backup still only ever runs on
 * GitHub's own runners (Rule 40.1 — DB-heavy work stays off the live
 * request cycle). This is a SEPARATE workflow file from the 2:00 AM
 * nightly cron (database-backup.yml) — both run the identical
 * scripts/runBackup.js, but keeping them in separate files means a
 * manual click never shows up in the Actions tab as "Nightly Database
 * Backup — Manually run by ...", which read as if the cron itself had
 * been triggered by hand.
 *
 * REAL-TIME ROW, NO DELAY:
 * Previously this route only dispatched the workflow and returned a
 * toast telling the admin to refresh later — the actual BackupLog row
 * didn't exist until GitHub's runner queued, booted, and reached
 * scripts/runBackup.js's own prisma.backupLog.create() call, which can
 * take anywhere from several seconds to over a minute depending on
 * runner availability. This route now creates that row itself, with
 * status "running", in the same request that handles the button
 * click — a single lightweight INSERT, not the backup work itself, so
 * Rule 40.1 still holds. The row's id is passed to the workflow via
 * workflow_dispatch's `logId` input; scripts/runBackup.js reads it back
 * out of BACKUP_LOG_ID and updates this SAME row instead of creating a
 * second one, so the row the admin sees appear immediately is the exact
 * row that later fills in with the real result.
 *
 * DATA FLOW:
 * 1. Admin clicks "Run Backup Now" in BackupLogsClient
 * 2. This route verifies the session, creates the BackupLog row, then
 *    calls triggerWorkflowDispatch("database-backup.yml", { logId })
 * 3. Logs a security event so the manual trigger shows up in the
 *    audit trail (who ran it, when)
 * 4. Returns the new row so BackupLogsClient can prepend it to the
 *    table immediately, with no refresh needed
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { triggerWorkflowDispatch } from "@/services/github";
import { logSecurityEvent } from "@/services/securityLog";
import { prisma } from "@/services/prisma";

export async function POST(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    // Created up front so the admin sees the row the instant they
    // click — see the file header for why this doesn't violate
    // Rule 40.1 (it's metadata bookkeeping, not the backup itself).
    const logRow = await prisma.backupLog.create({
      data: { status: "running", triggerSource: "manual" },
    });

    try {
      await triggerWorkflowDispatch("manual-database-backup.yml", { logId: logRow.id });
    } catch (dispatchError) {
      // The row already exists and would otherwise sit at "running"
      // forever if the workflow never actually started — mark it
      // failed immediately so the table never shows a stuck row with
      // no explanation.
      await prisma.backupLog.update({
        where: { id: logRow.id },
        data: {
          status: "failed",
          errorMessage: "Failed to start the backup workflow on GitHub Actions.",
          completedAt: new Date(),
        },
      });
      throw dispatchError;
    }

    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: "Manually triggered a database backup from the Backups page.",
    });

    return NextResponse.json({
      success: true,
      data: { backupLog: logRow },
      message: "Backup started.",
    });
  } catch (error) {
    console.error("[api/admin/backup-logs/trigger] Failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't start the backup. Please try again." },
      { status: 500 }
    );
  }
}
