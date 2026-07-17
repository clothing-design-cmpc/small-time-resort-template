/**
 * FILE: scripts/runDatabaseWipe.js
 * PURPOSE:
 * Executes a scheduled database wipe — the actual TRUNCATE, and the
 * pre-wipe backup if the super-admin chose "with_backup". Runs on
 * GitHub's own runners (.github/workflows/database-wipe-executor.yml),
 * on a short schedule, checking for DatabaseWipeRequest rows that are
 * both due and confirmed. Same "decoupled from live traffic" guarantee
 * scripts/runBackup.js already relies on (Rule 40.1) — this NEVER runs
 * inside a Next.js API route or a guest/admin request.
 *
 * *** SAFETY GATE — READ BEFORE CHANGING ANYTHING BELOW ***
 * A request only gets touched here if ALL of these are true:
 *   1. status === "pending"
 *   2. scheduledAt <= now            (24-hour grace period has elapsed)
 *   3. finalConfirmedAt is NOT null  (super-admin clicked "Continue" on
 *      the blocking 2-hour warning modal — DatabaseWipeGraceModal.jsx)
 * A request that reaches its scheduledAt with finalConfirmedAt still
 * null is left untouched (still "pending") — see services/
 * databaseWipeRequest.js's own comment for why this is intentional.
 *
 * TABLES_TO_TRUNCATE below is a DELIBERATE, explicit allowlist — never
 * "truncate everything" — so admin accounts, security/audit history,
 * and site configuration always survive a wipe. *** Miguel: confirm
 * this list matches what "wipe the database" should actually mean for
 * Villa Azure before this workflow is ever allowed to run against
 * production — it currently targets guest/operational data only and
 * deliberately leaves room/amenity/testimonial/gallery content and all
 * admin/security/config tables alone. ***
 *
 * DATA FLOW:
 * 1. Finds the due + confirmed DatabaseWipeRequest (there is only ever
 *    one active at a time — see initiateWipeRequest's own guard)
 * 2. If backupOption === "with_backup": runs the exact same pg_dump +
 *    dual-upload flow as scripts/runBackup.js, and only proceeds to
 *    truncate if that backup actually succeeded — a failed backup
 *    aborts the wipe entirely rather than silently skipping it
 * 3. TRUNCATEs every table in TABLES_TO_TRUNCATE inside one transaction
 * 4. Writes the final status (completed/failed) back onto the request row
 *
 * USAGE: npm run wipe-database (reads DIRECT_URL, R2, and Google Drive
 * env vars the same way scripts/runBackup.js does)
 */
import "./loadEnv.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import prismaPkg from "@prisma/client";
const { PrismaClient } = prismaPkg;
import { PrismaPg } from "@prisma/adapter-pg";
import { uploadToR2 } from "../services/r2.js";
import { uploadToDrive } from "../services/googleDrive.js";
import { withRetry } from "./lib/withRetry.js";
import { logDbHost } from "./lib/logDbHost.js";

const execFileAsync = promisify(execFile);
const gzipAsync = promisify(gzip);

// --- SAFETY ALLOWLIST — see the file header above before editing ---
// Only guest/operational data. Content (rooms, amenities, testimonials,
// gallery, activities, shop catalog) and every admin/security/config
// table are deliberately excluded.
const TABLES_TO_TRUNCATE = [
  "bookings",
  "visitor_logs",
  "account_activity_logs",
  "page_view_daily",
  "activity_archive_logs",
];

logDbHost("DIRECT_URL", process.env.DIRECT_URL);
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

function backupFileLabel() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/** Same pg_dump invocation as scripts/runBackup.js — see that file for why these flags. */
async function runPgDump() {
  const { stdout } = await execFileAsync(
    "pg_dump",
    [process.env.DIRECT_URL, "--no-owner", "--no-privileges", "--format=plain"],
    { maxBuffer: 1024 * 1024 * 1024, encoding: "buffer" }
  );
  return stdout;
}

/**
 * runPreWipeBackup
 * Identical flow to scripts/runBackup.js's main(), reused here so a
 * wipe scheduled "with_backup" gets the exact same dual-destination
 * (R2 + Google Drive) guarantee as the nightly backup. Returns the
 * created BackupLog id on success, or null if both destinations
 * failed — the caller treats null as a hard stop, never proceeding to
 * truncate without a real backup on record.
 */
async function runPreWipeBackup() {
  const logRow = await withRetry(() => prisma.backupLog.create({ data: { status: "running" } }), {
    label: "backupLog.create (pre-wipe)",
  });

  let dumpBuffer;
  try {
    dumpBuffer = await runPgDump();
    console.log(`[wipe] Pre-wipe pg_dump complete — ${dumpBuffer.length} bytes raw.`);
  } catch (dumpError) {
    console.error("[wipe] Pre-wipe pg_dump failed:", dumpError.message);
    await withRetry(() =>
      prisma.backupLog.update({
        where: { id: logRow.id },
        data: { status: "failed", errorMessage: `pg_dump failed: ${dumpError.message}`, completedAt: new Date() },
      })
    );
    return null;
  }

  const compressed = await gzipAsync(dumpBuffer);
  const fileName = `villa-azure-pre-wipe-backup-${backupFileLabel()}.sql.gz`;
  const r2Key = `backups/${fileName}`;

  let r2Result = null;
  let r2Error = null;
  try {
    const r2Url = await uploadToR2(r2Key, compressed, "application/gzip");
    r2Result = { key: r2Key, url: r2Url };
  } catch (error) {
    r2Error = error.message;
    console.error("[wipe] Pre-wipe R2 upload failed:", error.message);
  }

  let driveResult = null;
  let driveError = null;
  try {
    driveResult = await uploadToDrive(fileName, compressed, "application/gzip");
  } catch (error) {
    driveError = error.message;
    console.error("[wipe] Pre-wipe Google Drive upload failed:", error.message);
  }

  const bothFailed = !r2Result && !driveResult;
  const combinedError = [r2Error && `R2: ${r2Error}`, driveError && `Drive: ${driveError}`].filter(Boolean).join(" | ");

  await withRetry(() =>
    prisma.backupLog.update({
      where: { id: logRow.id },
      data: {
        status: bothFailed ? "failed" : "success",
        fileSizeBytes: compressed.length,
        r2Key: r2Result?.key ?? null,
        r2Url: r2Result?.url ?? null,
        driveFileId: driveResult?.fileId ?? null,
        driveViewLink: driveResult?.viewLink ?? null,
        errorMessage: combinedError || null,
        completedAt: new Date(),
      },
    })
  );

  return bothFailed ? null : logRow.id;
}

async function main() {
  console.log("[wipe] Checking for a due, confirmed database wipe…");

  const dueRequest = await prisma.databaseWipeRequest.findFirst({
    where: {
      status: "pending",
      scheduledAt: { lte: new Date() },
      finalConfirmedAt: { not: null },
    },
  });

  if (!dueRequest) {
    console.log("[wipe] Nothing due right now. Exiting.");
    return;
  }

  console.log(`[wipe] Found due request ${dueRequest.id} (backupOption: ${dueRequest.backupOption}).`);

  let backupLogId = null;
  if (dueRequest.backupOption === "with_backup") {
    backupLogId = await runPreWipeBackup();
    if (!backupLogId) {
      console.error("[wipe] Pre-wipe backup failed on both destinations — ABORTING the wipe. Nothing was truncated.");
      await prisma.databaseWipeRequest.update({
        where: { id: dueRequest.id },
        data: { status: "failed", errorMessage: "Pre-wipe backup failed on both R2 and Google Drive — wipe aborted.", completedAt: new Date() },
      });
      process.exitCode = 1;
      return;
    }
    console.log("[wipe] Pre-wipe backup succeeded — proceeding to truncate.");
  }

  try {
    // Single transaction: either every listed table truncates, or none
    // do — never leave the database in a half-wiped state.
    await prisma.$transaction(
      TABLES_TO_TRUNCATE.map((tableName) => prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tableName}" CASCADE`))
    );
    console.log(`[wipe] Truncated ${TABLES_TO_TRUNCATE.length} tables successfully.`);

    await prisma.databaseWipeRequest.update({
      where: { id: dueRequest.id },
      data: { status: "completed", backupLogId, completedAt: new Date() },
    });

    console.log("[wipe] Done.");
  } catch (truncateError) {
    console.error("[wipe] TRUNCATE failed:", truncateError.message);
    await prisma.databaseWipeRequest.update({
      where: { id: dueRequest.id },
      data: { status: "failed", backupLogId, errorMessage: `TRUNCATE failed: ${truncateError.message}`, completedAt: new Date() },
    });
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[wipe] Unexpected error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
