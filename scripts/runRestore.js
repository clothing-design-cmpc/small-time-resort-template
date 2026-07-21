/**
 * FILE: scripts/runRestore.js
 * PURPOSE:
 * Downloads a super-admin-uploaded .sql or .sql.gz file from its
 * Cloudflare R2 URL and applies it against the database with `psql`,
 * then updates the matching SqlImportLog row with the result.
 *
 * *** THIS SCRIPT IS DELIBERATELY NOT PART OF THE LIVE APP. ***
 * It only ever runs on GitHub's own runners, triggered by
 * .github/workflows/database-restore.yml (workflow_dispatch), never
 * inside a Next.js API route — see scripts/runBackup.js for the same
 * reasoning (Rule 40.1: DB-heavy work stays off the live request cycle).
 *
 * Task 3 fix — SCHEMA DRIFT RECONCILIATION AFTER RESTORE:
 * The uploaded .sql file is a raw pg_dump (same format scripts/
 * runBackup.js and scripts/runDatabaseWipe.js's pre-wipe backup both
 * produce) — it fully DROPs and re-CREATEs every table exactly as it
 * existed at backup time. If that backup predates a later schema.prisma
 * change (a column added since, say), psql restoring it used to
 * silently put the live database back into that OLDER shape — nothing
 * here ever re-synced it against the CURRENT schema.prisma afterward.
 * The app would then start throwing Prisma's "column ... does not
 * exist" error on the very first query that touches the missing
 * column (the exact same class of bug Task 1 hit from the other
 * direction — code expecting a column the database doesn't have).
 * runSchemaReconciliation() below closes that gap: `npx prisma db push`
 * declaratively reconciles the live database structure to match
 * schema.prisma every time, right after the data itself is restored —
 * this is Prisma's own schema-sync mechanism (Rule 37.2 in the
 * project's own DB-change-workflow reference), NOT a per-row upsert;
 * see that step's own comment below for why db push, not migrate.
 * A failure here now fails the WHOLE import (not just a console
 * warning) — a restore that leaves the schema out of sync isn't
 * actually a safe, usable "success," even though the data itself
 * loaded fine.
 *
 * DATA FLOW:
 * 1. app/api/admin/sql-import/route.js uploads the file to R2, creates
 *    a SqlImportLog row (status "running"), and dispatches this
 *    workflow with { sql_file_url, import_log_id }
 * 2. This script downloads that file, gunzips it if needed, and pipes
 *    it into `psql $DIRECT_URL`
 * 3. Once psql succeeds, `npx prisma db push` reconciles the live
 *    schema back to schema.prisma's current shape
 * 4. The SqlImportLog row is updated to "success" or "failed"
 *
 * USAGE (GitHub Actions only): node scripts/runRestore.js
 * Reads SQL_FILE_URL, IMPORT_LOG_ID, and DIRECT_URL from the environment.
 */
import "./loadEnv.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { writeFile, unlink } from "node:fs/promises";
// @prisma/client is a CommonJS module — Node's ESM loader (used when
// GitHub Actions runs this script directly with `node`, unlike Next.js's
// bundler which papers over this) can't statically resolve named exports
// from it, so `import { PrismaClient } from "@prisma/client"` throws
// "Named export 'PrismaClient' not found" at runtime. Default-import the
// whole module and destructure instead.
import prismaPkg from "@prisma/client";
const { PrismaClient } = prismaPkg;
import { PrismaPg } from "@prisma/adapter-pg";
import { withRetry } from "./lib/withRetry.js";
import { logDbHost } from "./lib/logDbHost.js";

const execFileAsync = promisify(execFile);
const gunzipAsync = promisify(gunzip);

logDbHost("DIRECT_URL", process.env.DIRECT_URL);
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

const TEMP_SQL_PATH = "/tmp/sql-import-restore.sql";

/**
 * downloadSqlFile
 * Fetches the uploaded file from its R2 URL and returns the raw SQL
 * text, gunzipping first if the URL ends in .gz.
 */
async function downloadSqlFile(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download SQL file: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (url.endsWith(".gz")) {
    const decompressed = await gunzipAsync(buffer);
    return decompressed;
  }

  return buffer;
}

/**
 * resetPublicSchema
 * Task 4 fix — SCHEMA-DROP CONFLICT WITH WIPE-PRESERVED OBJECTS:
 * The dump always contains an unqualified `DROP SCHEMA public;` (pg_dump
 * --clean's standard output) with no CASCADE. That fails outright
 * whenever the live public schema still has objects the dump script
 * itself never dropped — specifically, extensions like btree_gist, and
 * any table on runDatabaseWipe.js's TABLES_TO_PRESERVE denylist (e.g.
 * vault_passphrase) that a wipe deliberately left standing. Postgres
 * then refuses with "cannot drop schema public because other objects
 * depend on it" and the whole restore aborts before a single table
 * loads.
 *
 * Fix: drop + recreate an EMPTY public schema ourselves first, with
 * CASCADE, in its own separate psql call (must commit on its own —
 * this can't live inside runPsqlRestore's --single-transaction run,
 * since the dump's own "DROP SCHEMA public;" line needs to hit an
 * already-empty, dependency-free schema). No data is lost beyond what
 * a full restore already implies: the dump recreates every table it
 * captured — including vault_passphrase, if that table existed at
 * backup time — moments later in the very same run.
 */
async function resetPublicSchema() {
  await execFileAsync(
    "psql",
    [process.env.DIRECT_URL, "--set", "ON_ERROR_STOP=1", "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"],
    { maxBuffer: 1024 * 1024 * 1024 }
  );
}

/**
 * runPsqlRestore
 * Writes the SQL to a temp file and pipes it into psql against
 * DIRECT_URL. --single-transaction so a failure partway through rolls
 * back instead of leaving the database half-restored.
 */
async function runPsqlRestore(sqlBuffer) {
  await writeFile(TEMP_SQL_PATH, sqlBuffer);
  try {
    await execFileAsync(
      "psql",
      [process.env.DIRECT_URL, "--single-transaction", "--set", "ON_ERROR_STOP=1", "-f", TEMP_SQL_PATH],
      { maxBuffer: 1024 * 1024 * 1024 }
    );
  } finally {
    await unlink(TEMP_SQL_PATH).catch(() => {});
  }
}

/**
 * runSchemaReconciliation
 * Runs `npx prisma db push` against DIRECT_URL right after the raw SQL
 * restore completes, so the live database structure always matches
 * the CURRENT schema.prisma — not whatever shape it happened to be in
 * when the uploaded backup was taken. This is a declarative schema
 * SYNC (Prisma's own term — see Rule 37.2's "ACTION -> Regen types"
 * cheat sheet), not a row-level UPSERT: it adds/drops columns and
 * tables to match schema.prisma, it never touches individual row data.
 * --accept-data-loss is required non-interactively here (db push
 * normally pauses for a y/n prompt on anything destructive) — running
 * unattended on a GitHub runner has no terminal to answer that prompt,
 * and the restore that just ran is itself already the destructive
 * action; reconciling the schema afterward is comparatively safe.
 * NOTE: Prisma 7 removed the --skip-generate flag entirely — db push no
 * longer auto-runs `generate` at all, with or without the flag, so
 * passing it now makes the CLI reject the whole command (prints --help,
 * exits 1) instead of silently ignoring it. The flag is omitted here;
 * Client was already generated once earlier in the workflow (see
 * database-restore.yml's own step) before any of this runs.
 */
async function runSchemaReconciliation() {
  await execFileAsync(
    "npx",
    ["prisma", "db", "push", "--accept-data-loss"],
    { maxBuffer: 1024 * 1024 * 1024, env: process.env }
  );
}

async function main() {
  const { SQL_FILE_URL, IMPORT_LOG_ID } = process.env;

  if (!SQL_FILE_URL || !IMPORT_LOG_ID) {
    console.error("[restore] Missing SQL_FILE_URL or IMPORT_LOG_ID.");
    process.exitCode = 1;
    return;
  }

  console.log("[restore] Starting SQL import for log", IMPORT_LOG_ID);

  // Snapshot the log row BEFORE the restore runs. The restored .sql file is a
  // full pg_dump that DROPs and re-CREATEs every table — including
  // sql_import_logs itself — so the "running" row created by the API route
  // is wiped out mid-restore. Without this snapshot, the later status write
  // has no fallback data to recreate the row with, and a plain .update()
  // throws P2025 ("no record found for an update") once the row is gone.
  const existingLog = await prisma.sqlImportLog.findUnique({ where: { id: IMPORT_LOG_ID } });

  // upsertLogStatus
  // Writes the final status using upsert instead of update: if the restore
  // preserved the row, this behaves exactly like an update. If the restore's
  // DROP/CREATE wiped it, this recreates it (same id) using the pre-restore
  // snapshot so fileName/sourceUrl/triggeredBy/startedAt aren't lost, with
  // the given status applied on top.
  async function upsertLogStatus(statusData) {
    await withRetry(
      () =>
        prisma.sqlImportLog.upsert({
          where: { id: IMPORT_LOG_ID },
          update: statusData,
          create: {
            id: IMPORT_LOG_ID,
            fileName: existingLog?.fileName ?? "unknown.sql",
            sourceUrl: existingLog?.sourceUrl ?? SQL_FILE_URL,
            fileSizeBytes: existingLog?.fileSizeBytes ?? null,
            triggeredBy: existingLog?.triggeredBy ?? null,
            startedAt: existingLog?.startedAt ?? new Date(),
            ...statusData,
          },
        }),
      { label: "sqlImportLog.upsert" }
    );
  }

  try {
    const sqlBuffer = await downloadSqlFile(SQL_FILE_URL);
    console.log(`[restore] Downloaded and decompressed — ${sqlBuffer.length} bytes.`);

    console.log("[restore] Resetting public schema to clear wipe-preserved objects before restore…");
    await resetPublicSchema();
    console.log("[restore] Public schema reset.");

    await runPsqlRestore(sqlBuffer);
    console.log("[restore] psql restore complete.");

    console.log("[restore] Reconciling database schema against schema.prisma…");
    await runSchemaReconciliation();
    console.log("[restore] Schema reconciliation complete — database structure now matches schema.prisma.");

    await upsertLogStatus({ status: "success", completedAt: new Date() });
    console.log("[restore] Done.");
  } catch (error) {
    console.error("[restore] FAILED:", error.message);
    await upsertLogStatus({ status: "failed", errorMessage: error.message, completedAt: new Date() });
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[restore] Unexpected error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });