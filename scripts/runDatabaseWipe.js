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
 * TABLES_TO_PRESERVE below is a DELIBERATE, explicit denylist —
 * "wipe the database" now means truncate EVERY table except these few,
 * so the hidden vault recovery path (and what it needs to investigate
 * and re-open the site afterward) always survives a wipe:
 *   - vault: OTP state (second factor) for the hidden recovery login
 *   - vault_passphrase: passphrase hash + expiry (first factor) — split
 *     out of `vault` into its own table; must be preserved alongside it
 *     or the vault's own login is stranded, falling back to whatever
 *     stale VAULT_PASSPHRASE_HASH is still set in env (if any)
 *   - database_wipe_requests: the wipe's own in-flight request state —
 *     truncating this mid-flow would strand the wipe itself
 *   - system_settings: holds postWipeLockdown/maintenanceMode — the
 *     ONLY thing that lets the vault lift the lockdown afterward
 *   - backup_logs: the R2/Google Drive links needed to actually
 *     restore data after a wipe
 *   - security_logs: the breach investigation trail, in case this
 *     wipe was triggered because of one
 * Everything else — including admin_profiles — is truncated. After a
 * full wipe, only the hidden vault path (never the regular super-admin
 * login) can get back in, by design.
 *
 * WHY THIS IS QUERIED LIVE INSTEAD OF HARDCODED:
 * A hardcoded allowlist previously broke the wipe for two full runs —
 * "page_view_daily" (singular "view") was listed instead of
 * PageViewDaily's actual mapped table name, "page_views_daily"
 * (plural), producing Postgres error 42P01 (relation does not exist)
 * inside the $transaction, and because $executeRawUnsafe calls are
 * batched into ONE transaction, that single bad name failed the WHOLE
 * TRUNCATE, not just its own table — while the request still got
 * marked "failed" with nothing actually wiped. A denylist sidesteps
 * that class of bug entirely: instead of a maintained list of table
 * names that has to be typed correctly and kept in sync with the
 * schema, every table name below is read straight from Postgres
 * itself (pg_tables) at run time, so there is nothing to mistype and
 * no table this script doesn't already know exists.
 *
 * DATA FLOW:
 * 1. Finds the due + confirmed DatabaseWipeRequest (there is only ever
 *    one active at a time — see initiateWipeRequest's own guard)
 * 2. If backupOption === "with_backup": runs the exact same pg_dump +
 *    dual-upload flow as scripts/runBackup.js, and only proceeds to
 *    truncate if that backup actually succeeded — a failed backup
 *    aborts the wipe entirely rather than silently skipping it
 * 3. Queries pg_tables for every table in the public schema, subtracts
 *    TABLES_TO_PRESERVE, and TRUNCATEs the rest inside one transaction
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
import { activatePostWipeLockdown } from "../services/postWipeLockdown.js";
import { logSecurityEvent } from "../services/securityLog.js";
import { withRetry } from "./lib/withRetry.js";
import { logDbHost } from "./lib/logDbHost.js";

const execFileAsync = promisify(execFile);
const gzipAsync = promisify(gzip);

// --- SAFETY DENYLIST — see the file header above before editing ---
// The only tables a wipe must never touch. Everything else in the
// public schema gets truncated — see getTablesToTruncate() below.
const TABLES_TO_PRESERVE = [
  "vault",
  "vault_passphrase", // split out of `vault` into its own table later —
                      // must stay alongside it or a wipe strands the
                      // vault's own login (first factor gone, falls
                      // back silently to the stale env var instead)
  "database_wipe_requests",
  "system_settings",
  "backup_logs",
  "security_logs",
];

/**
 * getTablesToTruncate
 * Reads every table actually present in the public schema (pg_tables)
 * and returns all of them except TABLES_TO_PRESERVE. Live query, not a
 * hardcoded list — see the file header for why. Also guards against
 * pg_tables ever returning zero rows (a misconfigured DIRECT_URL
 * pointed at an empty schema) by refusing to proceed rather than
 * truncating nothing and reporting false success.
 */
async function getTablesToTruncate() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  const allTableNames = rows.map((row) => row.tablename);

  if (allTableNames.length === 0) {
    throw new Error("pg_tables returned no tables in the public schema — refusing to proceed.");
  }

  return allTableNames.filter((tableName) => !TABLES_TO_PRESERVE.includes(tableName));
}

logDbHost("DIRECT_URL", process.env.DIRECT_URL);
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

function backupFileLabel() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * Same pg_dump invocation as scripts/runBackup.js — see that file's
 * own runPgDump() comment for why --schema=public --clean --if-exists
 * are required (otherwise a later restore of this exact pre-wipe
 * backup fails on Supabase's own schemas / already-existing tables).
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
  const logRow = await withRetry(() => prisma.backupLog.create({ data: { status: "running", triggerSource: "pre_wipe" } }), {
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
      await logSecurityEvent({
        eventType: "admin_action",
        actor: "system",
        details: "Database wipe ABORTED — pre-wipe backup failed on both R2 and Google Drive. Nothing was truncated.",
      });
      process.exitCode = 1;
      return;
    }
    console.log("[wipe] Pre-wipe backup succeeded — proceeding to truncate.");
  }

  try {
    const tablesToTruncate = await getTablesToTruncate();
    console.log(
      `[wipe] Truncating ${tablesToTruncate.length} table(s), preserving: ${TABLES_TO_PRESERVE.join(", ")}`
    );

    // Single transaction: either every table truncates, or none do —
    // never leave the database in a half-wiped state.
    await prisma.$transaction(
      tablesToTruncate.map((tableName) => prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tableName}" CASCADE`))
    );
    console.log(`[wipe] Truncated ${tablesToTruncate.length} tables successfully.`);

    await prisma.databaseWipeRequest.update({
      where: { id: dueRequest.id },
      data: { status: "completed", backupLogId, completedAt: new Date() },
    });

    await logSecurityEvent({
      eventType: "admin_action",
      actor: "system",
      details: `Database wipe completed successfully (${
        dueRequest.backupOption === "with_backup" ? "with backup" : "WITHOUT backup"
      }). ${tablesToTruncate.length} table(s) truncated.`,
    });

    // Flip site-wide post-wipe lockdown ON — Task 2. This is now a
    // safety-net call: the "TRUNCATE NOW" bypass routes
    // (app/api/superAdmin/wipe/truncate-now, app/api/admin/vault-wipe/
    // truncate-now) already activate this synchronously the moment
    // they're confirmed, well before this script even starts running.
    // This call only matters as the FIRST activation for the plain
    // 24-hour scheduled path (no bypass, no button press to hook into)
    // — activatePostWipeLockdown() is an idempotent upsert either way.
    // Deliberately its own step, after the update above, so a failure
    // here never masks whether the truncate itself actually succeeded
    // (that row already says "completed" either way). Both visitor
    // pages (app/visitor/layout.jsx) and every super-admin page/API
    // (proxy.js) go fully dark on the very next request — see those
    // files' own comments — and can only be brought back online from
    // the hidden vault recovery page (app/api/admin/post-wipe-lockdown),
    // never by a regular super-admin session.
    try {
      // Pass this script's own DIRECT_URL-based client — the helper's
      // default DATABASE_URL-based client isn't set in this workflow's
      // env. See services/postWipeLockdown.js's own comment on this.
      await activatePostWipeLockdown(prisma);
      console.log("[wipe] Post-wipe lockdown enabled — visitor site and super-admin are now fully blocked.");
    } catch (lockdownError) {
      console.error("[wipe] Truncate succeeded but failed to enable post-wipe lockdown:", lockdownError.message);
    }

    console.log("[wipe] Done.");
  } catch (truncateError) {
    console.error("[wipe] TRUNCATE failed:", truncateError.message);
    await prisma.databaseWipeRequest.update({
      where: { id: dueRequest.id },
      data: { status: "failed", backupLogId, errorMessage: `TRUNCATE failed: ${truncateError.message}`, completedAt: new Date() },
    });
    await logSecurityEvent({
      eventType: "admin_action",
      actor: "system",
      details: `Database wipe FAILED during TRUNCATE: ${truncateError.message}`,
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