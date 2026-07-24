/**
 * FILE: scripts/runBackup.js
 * PURPOSE:
 * Nightly database backup — dumps the entire Postgres database with
 * `pg_dump`, uploads the compressed dump to BOTH Cloudflare R2 and
 * Google Drive independently, and records the result in the BackupLog
 * table so the super-admin Backups page has history.
 *
 * *** THIS SCRIPT IS DELIBERATELY NOT PART OF THE LIVE APP. ***
 * It never runs inside a Next.js API route or during a guest's request.
 * It's triggered on a schedule by .github/workflows/database-backup.yml
 * (a completely separate process/machine from the app server), so a
 * backup running has zero effect on booking response times — see the
 * "decoupled from live traffic" explanation this was built for.
 *
 * DATA FLOW:
 * 1. Runs `pg_dump` against DIRECT_URL (session pooler — pg_dump needs
 *    prepared-statement support the transaction pooler doesn't give)
 * 2. Gzips the dump in memory, then computes its SHA-256 checksum
 *    (Task 6 — backup integrity check) — BEFORE either upload, so the
 *    stored checksum always reflects the actual uploaded bytes
 * 3. Uploads to R2 (services/r2.js) and Google Drive (services/googleDrive.js)
 *    — independently; one destination failing does not stop the other
 * 4. Writes one BackupLog row summarizing both results (plus the
 *    checksum) — reusing the row the trigger route already created
 *    (via BACKUP_LOG_ID) when dispatched from the Backups page, or
 *    creating a fresh one otherwise (nightly cron / manual "Run
 *    workflow" click)
 *
 * USAGE: npm run backup   (reads DIRECT_URL, R2, and Google Drive env
 * vars from the environment — GitHub Actions injects these from repo
 * secrets; locally, `.env.local` covers it if you want to test manually)
 */
import "./loadEnv.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { createHash } from "node:crypto";
// @prisma/client is a CommonJS module — Node's ESM loader (used when
// GitHub Actions runs this script directly with `node`, unlike Next.js's
// bundler which papers over this) can't statically resolve named exports
// from it, so `import { PrismaClient } from "@prisma/client"` throws
// "Named export 'PrismaClient' not found" at runtime. Default-import the
// whole module and destructure instead.
import prismaPkg from "@prisma/client";
const { PrismaClient } = prismaPkg;
import { PrismaPg } from "@prisma/adapter-pg";
import { uploadToR2 } from "../services/r2.js";
import { uploadToDrive } from "../services/googleDrive.js";
import { withRetry } from "./lib/withRetry.js";
import { logDbHost } from "./lib/logDbHost.js";

const execFileAsync = promisify(execFile);
const gzipAsync = promisify(gzip);

// This script talks to Postgres directly via DIRECT_URL, so it uses its
// own Prisma Client instance (not services/prisma.js's DATABASE_URL
// pooler client) purely to write the BackupLog row at the end.
logDbHost("DIRECT_URL", process.env.DIRECT_URL);
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

function backupFileLabel() {
  const now = new Date();
  // "YYYY-MM-DDTHH-MM-SS" — includes time, not just the date, so two
  // backups on the same calendar day (e.g. the nightly 2 AM run plus a
  // manual "Run Backup Now" click) never collide on the same filename.
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * runPgDump
 * Shells out to the `pg_dump` binary (must be installed on the runner —
 * the GitHub Actions workflow installs postgresql-client before this
 * runs) and returns the dump as a Buffer via stdout.
 *
 * Task 3 fix — RESTORE WAS FAILING ON SUPABASE-MANAGED SCHEMAS:
 * A plain `pg_dump` with no --schema filter dumps the ENTIRE database,
 * including schemas Supabase itself creates and manages (auth,
 * storage, extensions, graphql, realtime, vault, etc.). Restoring that
 * dump onto an existing Supabase project — which already has those
 * schemas — made psql fail immediately on `CREATE SCHEMA auth`
 * ("schema \"auth\" already exists"), aborting the whole
 * --single-transaction restore before a single app table got touched.
 * This app only ever owns the "public" schema (see prisma/schema.prisma
 * — no @@schema attributes anywhere), so --schema=public is both
 * correct and sufficient; Supabase's own schemas are never ours to
 * back up or restore in the first place.
 *
 * --clean --if-exists: emits `DROP TABLE IF EXISTS ... CASCADE` (etc.)
 * ahead of every CREATE, so the dump is idempotent against a database
 * that still has its public-schema tables (a TRUNCATE-based wipe never
 * drops them) — without this, restoring onto an un-dropped table would
 * fail the exact same way on "relation ... already exists".
 */
async function runPgDump() {
  const { stdout } = await execFileAsync(
    "pg_dump",
    [
      process.env.DIRECT_URL,
      "--no-owner",
      "--no-privileges",
      "--format=plain",
      "--schema=public",
      "--clean",
      "--if-exists",
    ],
    { maxBuffer: 1024 * 1024 * 1024, encoding: "buffer" } // up to 1GB dump
  );
  return stdout;
}

async function main() {
  console.log("[backup] Starting database backup…");

  // Set by whichever workflow dispatched this run (database-backup.yml
  // for nightly/manual, pre-wipe-backup.yml for wipe-triggered) — see
  // each workflow's "Run backup script" step. Falls back to "manual"
  // so a local `npm run backup` test run (no env var set) still writes
  // a valid, non-crashing value instead of null.
  const triggerSource = process.env.TRIGGER_SOURCE || "manual";
  console.log(`[backup] Trigger source: ${triggerSource}`);

  // Row created up front so a crash mid-backup still leaves a visible
  // (if incomplete) trail on the admin page, instead of the run
  // disappearing silently.
  //
  // When dispatched from the Backups page's "Run Backup Now" button,
  // app/api/admin/backup-logs/trigger/route.js has ALREADY created this
  // row (status "running", triggerSource "manual") in the same request
  // that handled the click — that's what makes the row show up on the
  // page instantly instead of only once this script gets around to
  // running. BACKUP_LOG_ID carries that row's id through so we update
  // it here instead of creating a second, duplicate row. On the
  // nightly cron (and a manual "Run workflow" click from the Actions
  // tab, which has no way to pre-create anything) BACKUP_LOG_ID is
  // unset, so this falls back to creating its own row exactly as
  // before.
  let logRow;
  if (process.env.BACKUP_LOG_ID) {
    logRow = { id: process.env.BACKUP_LOG_ID };
    console.log(`[backup] Using pre-created BackupLog row ${logRow.id} (dispatched from the Backups page).`);
  } else {
    logRow = await withRetry(
      () => prisma.backupLog.create({ data: { status: "running", triggerSource } }),
      { label: "backupLog.create" }
    );
  }

  let dumpBuffer;
  try {
    dumpBuffer = await runPgDump();
    console.log(`[backup] pg_dump complete — ${dumpBuffer.length} bytes raw.`);
  } catch (dumpError) {
    console.error("[backup] pg_dump failed:", dumpError.message);
    await withRetry(
      () =>
        prisma.backupLog.update({
          where: { id: logRow.id },
          data: { status: "failed", errorMessage: `pg_dump failed: ${dumpError.message}`, completedAt: new Date() },
        }),
      { label: "backupLog.update (pg_dump failure)" }
    );
    process.exitCode = 1;
    return;
  }

  const compressed = await gzipAsync(dumpBuffer);
  const fileName = `villa-azure-backup-${backupFileLabel()}.sql.gz`;
  const r2Key = `backups/${fileName}`;

  // Task 6 — Backup integrity check. Computed on the exact bytes that
  // go to BOTH destinations below, BEFORE either upload — so it always
  // reflects the actual file content, never something derived from a
  // (possibly already-corrupted) copy at the destination.
  const checksumSha256 = createHash("sha256").update(compressed).digest("hex");
  console.log(`[backup] SHA-256: ${checksumSha256}`);

  // Upload to both destinations independently — one failing must not
  // silently hide the other's result, so each is caught on its own.
  let r2Result = null;
  let r2Error = null;
  try {
    const r2Url = await uploadToR2(r2Key, compressed, "application/gzip");
    r2Result = { key: r2Key, url: r2Url };
    console.log("[backup] Uploaded to R2:", r2Url);
  } catch (error) {
    r2Error = error.message;
    console.error("[backup] R2 upload failed:", error.message);
  }

  let driveResult = null;
  let driveError = null;
  try {
    driveResult = await uploadToDrive(fileName, compressed, "application/gzip");
    console.log("[backup] Uploaded to Google Drive:", driveResult.viewLink);
  } catch (error) {
    driveError = error.message;
    console.error("[backup] Google Drive upload failed:", error.message);
  }

  // A backup only counts as fully successful if BOTH destinations
  // received it. One destination failing still means one of the two
  // redundant copies doesn't exist — that must never show as a green
  // "success" run in GitHub Actions or a green badge on the Backups
  // page, or a real (if partial) failure goes unnoticed until the day
  // someone actually needs the missing copy.
  const bothFailed = !r2Result && !driveResult;
  const bothSucceeded = Boolean(r2Result) && Boolean(driveResult);
  const combinedError = [r2Error && `R2: ${r2Error}`, driveError && `Drive: ${driveError}`]
    .filter(Boolean)
    .join(" | ");

  // "failed"  — neither destination got the backup (worst case)
  // "partial" — only one of the two destinations got it (still a
  //             problem — the redundancy this rule exists for is gone)
  // "success" — both destinations got it
  const finalStatus = bothFailed ? "failed" : bothSucceeded ? "success" : "partial";

  await withRetry(
    () =>
      prisma.backupLog.update({
        where: { id: logRow.id },
        data: {
          status: finalStatus,
          fileSizeBytes: compressed.length,
          checksumSha256,
          r2Key: r2Result?.key ?? null,
          r2Url: r2Result?.url ?? null,
          driveFileId: driveResult?.fileId ?? null,
          driveViewLink: driveResult?.viewLink ?? null,
          errorMessage: combinedError || null,
          completedAt: new Date(),
        },
      }),
    { label: "backupLog.update (final)" }
  );

  if (finalStatus === "success") {
    console.log("[backup] Done.");
  } else if (finalStatus === "partial") {
    console.error(`[backup] PARTIAL — only one destination succeeded. ${combinedError}`);
  } else {
    console.error("[backup] FAILED — both destinations errored.");
  }

  // Any outcome other than both destinations succeeding must fail the
  // GitHub Actions run (red X) — not just the worst case.
  if (finalStatus !== "success") process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[backup] Unexpected error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });