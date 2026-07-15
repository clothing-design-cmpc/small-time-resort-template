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
 * 2. Gzips the dump in memory
 * 3. Uploads to R2 (services/r2.js) and Google Drive (services/googleDrive.js)
 *    — independently; one destination failing does not stop the other
 * 4. Writes one BackupLog row summarizing both results
 *
 * USAGE: npm run backup   (reads DIRECT_URL, R2, and Google Drive env
 * vars from the environment — GitHub Actions injects these from repo
 * secrets; locally, `.env.local` covers it if you want to test manually)
 */
import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
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

const execFileAsync = promisify(execFile);
const gzipAsync = promisify(gzip);

// This script talks to Postgres directly via DIRECT_URL, so it uses its
// own Prisma Client instance (not services/prisma.js's DATABASE_URL
// pooler client) purely to write the BackupLog row at the end.
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

function todayFileLabel() {
  const now = new Date();
  return now.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/**
 * runPgDump
 * Shells out to the `pg_dump` binary (must be installed on the runner —
 * the GitHub Actions workflow installs postgresql-client before this
 * runs) and returns the dump as a Buffer via stdout.
 */
async function runPgDump() {
  const { stdout } = await execFileAsync(
    "pg_dump",
    [process.env.DIRECT_URL, "--no-owner", "--no-privileges", "--format=plain"],
    { maxBuffer: 1024 * 1024 * 1024, encoding: "buffer" } // up to 1GB dump
  );
  return stdout;
}

async function main() {
  console.log("[backup] Starting database backup…");

  // Row created up front with status "running" so a crash mid-backup
  // still leaves a visible (if incomplete) trail on the admin page,
  // instead of the run disappearing silently. Wrapped in withRetry
  // since this is the very first DB round-trip in the run — the one
  // most likely to catch a transient DNS hiccup resolving the pooler
  // hostname on a fresh GitHub Actions runner.
  const logRow = await withRetry(() => prisma.backupLog.create({ data: { status: "running" } }), {
    label: "backupLog.create",
  });

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
  const fileName = `villa-azure-backup-${todayFileLabel()}.sql.gz`;
  const r2Key = `backups/${fileName}`;

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

  const bothFailed = !r2Result && !driveResult;
  const combinedError = [r2Error && `R2: ${r2Error}`, driveError && `Drive: ${driveError}`]
    .filter(Boolean)
    .join(" | ");

  await withRetry(
    () =>
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
      }),
    { label: "backupLog.update (final)" }
  );

  console.log(bothFailed ? "[backup] FAILED — both destinations errored." : "[backup] Done.");
  if (bothFailed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[backup] Unexpected error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });