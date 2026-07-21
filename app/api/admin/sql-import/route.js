/**
 * FILE: app/api/admin/sql-import/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Powers the "Import SQL to Fix Database" section on the Backups page.
 *
 * GET  -> paginated history of past SQL imports (SqlImportLog), same
 *         shape as GET /api/admin/backup-logs.
 * POST -> accepts an uploaded .sql/.sql.gz file, uploads the raw bytes
 *         to Cloudflare R2 (so GitHub's runner has a URL to download
 *         it from), creates a SqlImportLog row, and dispatches
 *         database-restore.yml to actually apply it. The heavy
 *         psql work never runs inside this request (Rule 40.1) — this
 *         route only uploads + hands off.
 *
 * DATA FLOW:
 * 1. Admin picks a file in BackupLogsClient, confirms the destructive-
 *    action modal, and the form posts here as multipart/form-data
 * 2. File is validated (extension + 100MB size cap), uploaded to R2
 *    under sql-imports/, and a SqlImportLog row is created
 * 3. triggerWorkflowDispatch() fires database-restore.yml with the R2
 *    URL and the new row's id so the workflow knows which row to
 *    update when it finishes
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { requireVaultSession } from "@/services/vaultAuth";
import { uploadToR2 } from "@/services/r2";
import { triggerWorkflowDispatch } from "@/services/github";
import { logSecurityEvent } from "@/services/securityLog";
import { markStaleRunningRowsAsFailed } from "@/services/staleRunWatchdog";

const PAGE_SIZE = 10;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ACCEPTED_EXTENSIONS = [".sql", ".sql.gz"];

/**
 * requireSuperAdminOrVaultSession
 * The normal Backups page reaches this route with a regular super-admin
 * "session" cookie. RecoveryClient.jsx's "Fix SQL" step reuses this same
 * route to restore during an ACTIVE post-wipe lockdown — but a
 * completed wipe deletes the super-admin session cookie automatically
 * (proxy.js), so requireSuperAdmin() alone would always fail exactly
 * when the vault owner needs this route most. Accept either: a normal
 * super-admin session, or a full (otpVerified) vault session — never
 * a passphrase-only vault cookie.
 */
function requireSuperAdminOrVaultSession(request) {
  const adminSession = requireSuperAdmin(request);
  if (adminSession) return { uid: adminSession.uid };

  const vaultSession = requireVaultSession(request);
  if (vaultSession?.otpVerified) return { uid: vaultSession.uid };

  return null;
}

export async function GET(request) {
  const session = requireSuperAdminOrVaultSession(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  // Auto-fail any row stuck on "running" too long — same watchdog used
  // by the Backups page (see services/staleRunWatchdog.js).
  await markStaleRunningRowsAsFailed(prisma.sqlImportLog, "sqlImportLog");

  try {
    const [importLogs, totalCount] = await Promise.all([
      prisma.sqlImportLog.findMany({
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.sqlImportLog.count(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        importLogs,
        page,
        pageSize: PAGE_SIZE,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
      },
      message: "SQL import history fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/sql-import] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load import history. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const session = requireSuperAdminOrVaultSession(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { success: false, data: null, message: "No file was provided." },
        { status: 400 }
      );
    }

    const lowerName = file.name.toLowerCase();
    const hasAcceptedExtension = ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!hasAcceptedExtension) {
      return NextResponse.json(
        { success: false, data: null, message: "Only .sql and .sql.gz files are accepted." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, data: null, message: "File is too large. Maximum size is 100MB." },
        { status: 400 }
      );
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const fileKey = `sql-imports/${randomUUID()}-${file.name}`;
    const contentType = lowerName.endsWith(".gz") ? "application/gzip" : "application/sql";
    const publicUrl = await uploadToR2(fileKey, rawBuffer, contentType);

    const importLog = await prisma.sqlImportLog.create({
      data: {
        status: "running",
        fileName: file.name,
        fileSizeBytes: file.size,
        sourceUrl: publicUrl,
        triggeredBy: session.uid,
      },
    });

    await triggerWorkflowDispatch("database-restore.yml", {
      sql_file_url: publicUrl,
      import_log_id: importLog.id,
    });

    // Audit trail — this is a destructive, whole-database action, so it
    // always gets its own explicit security log entry (Rule 6).
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Uploaded "${file.name}" and started a database restore (SqlImportLog ${importLog.id}).`,
    });

    return NextResponse.json({
      success: true,
      data: importLog,
      message: "Import started. This may take a minute — refresh the list below to see the result.",
    });
  } catch (error) {
    console.error("[api/admin/sql-import] Failed:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't start the import. Please try again." },
      { status: 500 }
    );
  }
}