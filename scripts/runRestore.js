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
 * DATA FLOW:
 * 1. app/api/admin/sql-import/route.js uploads the file to R2, creates
 *    a SqlImportLog row (status "running"), and dispatches this
 *    workflow with { sql_file_url, import_log_id }
 * 2. This script downloads that file, gunzips it if needed, and pipes
 *    it into `psql $DIRECT_URL`
 * 3. The SqlImportLog row is updated to "success" or "failed"
 *
 * USAGE (GitHub Actions only): node scripts/runRestore.js
 * Reads SQL_FILE_URL, IMPORT_LOG_ID, and DIRECT_URL from the environment.
 */
import "dotenv/config";
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

const execFileAsync = promisify(execFile);
const gunzipAsync = promisify(gunzip);

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

async function main() {
  const { SQL_FILE_URL, IMPORT_LOG_ID } = process.env;

  if (!SQL_FILE_URL || !IMPORT_LOG_ID) {
    console.error("[restore] Missing SQL_FILE_URL or IMPORT_LOG_ID.");
    process.exitCode = 1;
    return;
  }

  console.log("[restore] Starting SQL import for log", IMPORT_LOG_ID);

  try {
    const sqlBuffer = await downloadSqlFile(SQL_FILE_URL);
    console.log(`[restore] Downloaded and decompressed — ${sqlBuffer.length} bytes.`);

    await runPsqlRestore(sqlBuffer);
    console.log("[restore] psql restore complete.");

    await withRetry(
      () =>
        prisma.sqlImportLog.update({
          where: { id: IMPORT_LOG_ID },
          data: { status: "success", completedAt: new Date() },
        }),
      { label: "sqlImportLog.update (success)" }
    );
    console.log("[restore] Done.");
  } catch (error) {
    console.error("[restore] FAILED:", error.message);
    await withRetry(
      () =>
        prisma.sqlImportLog.update({
          where: { id: IMPORT_LOG_ID },
          data: { status: "failed", errorMessage: error.message, completedAt: new Date() },
        }),
      { label: "sqlImportLog.update (failure)" }
    );
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