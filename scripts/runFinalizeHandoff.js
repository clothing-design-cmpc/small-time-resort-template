/**
 * FILE: scripts/runFinalizeHandoff.js
 * PURPOSE:
 * Terminal-only, manually-run script for the ONE-TIME moment right
 * after QA testing is done and the site is ready to hand over to the
 * real owner: wipes every table of test/demo data EXCEPT the two
 * things the first-run setup wizard itself created —
 *   1. admin_profiles — the super-admin account (owner logs in with
 *      the same email/password from AdminSetupStep, Step 3)
 *   2. vault + vault_passphrase — the hidden disaster-recovery login
 *      (set via scripts/hashVaultPassphrase.js, wizard Step 6)
 * Everything else (rooms, amenities, store products, bookings, test
 * security/activity logs, policies/content text, homepage
 * customization, etc.) is truncated so the owner's first login sees a
 * genuinely blank, production-ready site — not the developer's test data.
 *
 * DELIBERATELY DIFFERENT FROM scripts/runDatabaseWipe.js:
 *   - That script preserves vault/security/backup state and wipes
 *     admin_profiles too — it's a disaster-recovery reset that assumes
 *     ONLY the hidden vault path should be able to get back in
 *     afterward, and needs a 24-hour grace period + confirmation modal
 *     because it can be triggered by anyone with super-admin access at
 *     any time in production.
 *   - This script keeps admin_profiles (so the owner's real login
 *     immediately works) and does NOT activate post-wipe lockdown —
 *     the whole point is a normal, working login for the owner right
 *     after this runs, not a locked-down site.
 *   - No DatabaseWipeRequest row, no grace period, no web UI trigger
 *     at all — this is a one-person, one-time, run-it-yourself-when-
 *     you're-ready terminal command. See SetupCompleteStep.jsx (Step
 *     10) for where this command is referenced to whoever finishes setup.
 *
 * SAFETY:
 *   - Requires typing the exact confirmation phrase at the prompt
 *     (see CONFIRMATION_PHRASE below) — no --yes/-y flag exists on
 *     purpose, so this can never be fired accidentally from a copied
 *     command history or a script.
 *   - Runs a pre-wipe backup to Cloudflare R2 by default (same pg_dump
 *     + upload flow as scripts/runBackup.js) before truncating
 *     anything. Pass --skip-backup only if you're certain you don't
 *     need one (e.g. this is pure test data with nothing worth saving).
 *   - Resets SystemSettings' security-tracking fields explicitly
 *     (rather than leaving stale test values behind) even though the
 *     table itself is truncated and will simply be recreated blank on
 *     the next write — documented here so it's obvious this is
 *     intentional, not an oversight: ownerVerifiedIp must start over
 *     so the OWNER's real first login (not the developer's test
 *     login) becomes the trusted IP baseline, and maintenanceMode /
 *     breachLockdown must not carry over a stale flag from GK3 testing.
 *
 * USAGE: node scripts/runFinalizeHandoff.js  (or: npm run finalize-handoff)
 *        node scripts/runFinalizeHandoff.js --skip-backup
 */
import "./loadEnv.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { createInterface } from "node:readline/promises";
import prismaPkg from "@prisma/client";
const { PrismaClient } = prismaPkg;
import { PrismaPg } from "@prisma/adapter-pg";
import { uploadToR2 } from "../services/r2.js";
import { logSecurityEvent } from "../services/securityLog.js";
import { withRetry } from "./lib/withRetry.js";
import { logDbHost } from "./lib/logDbHost.js";

const execFileAsync = promisify(execFile);
const gzipAsync = promisify(gzip);

// Must be typed EXACTLY at the prompt — this is the only safeguard,
// since there is deliberately no grace period or web UI for this
// script. Case-sensitive, on purpose.
const CONFIRMATION_PHRASE = "FINALIZE HANDOFF";

// --- SAFETY DENYLIST ---
// Only the two things the setup wizard itself created survive.
// database_wipe_requests is also preserved purely so this script can
// never corrupt the OTHER wipe feature's in-flight state if one
// happens to be scheduled — unrelated to "what the wizard set up",
// just a never-touch-that-table safety rule.
const TABLES_TO_PRESERVE = ["admin_profiles", "vault", "vault_passphrase", "database_wipe_requests"];

async function getTablesToTruncate(prisma) {
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  const allTableNames = rows.map((row) => row.tablename);

  if (allTableNames.length === 0) {
    throw new Error("pg_tables returned no tables in the public schema — refusing to proceed.");
  }

  return allTableNames.filter((tableName) => !TABLES_TO_PRESERVE.includes(tableName));
}

function backupFileLabel() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * Identical pg_dump invocation to scripts/runBackup.js / runDatabaseWipe.js.
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
 * runPreHandoffBackup
 * Same pg_dump + R2 upload flow as runBackup.js/runDatabaseWipe.js's
 * own pre-wipe backup, reused here so this irreversible action still
 * has a real snapshot on record before anything is truncated.
 */
async function runPreHandoffBackup(prisma) {
  const logRow = await withRetry(
    () => prisma.backupLog.create({ data: { status: "running", triggerSource: "pre_finalize_handoff" } }),
    { label: "backupLog.create (pre-finalize-handoff)" }
  );

  let dumpBuffer;
  try {
    dumpBuffer = await runPgDump();
    console.log(`[finalize-handoff] Pre-wipe pg_dump complete — ${dumpBuffer.length} bytes raw.`);
  } catch (dumpError) {
    console.error("[finalize-handoff] Pre-wipe pg_dump failed:", dumpError.message);
    await withRetry(() =>
      prisma.backupLog.update({
        where: { id: logRow.id },
        data: { status: "failed", errorMessage: `pg_dump failed: ${dumpError.message}`, completedAt: new Date() },
      })
    );
    return null;
  }

  const compressed = await gzipAsync(dumpBuffer);
  const fileName = `villa-azure-pre-finalize-handoff-${backupFileLabel()}.sql.gz`;
  const r2Key = `backups/${fileName}`;

  let r2Result = null;
  let r2Error = null;
  try {
    const r2Url = await uploadToR2(r2Key, compressed, "application/gzip");
    r2Result = { key: r2Key, url: r2Url };
  } catch (error) {
    r2Error = error.message;
    console.error("[finalize-handoff] Pre-wipe R2 upload failed:", error.message);
  }

  const failed = !r2Result;

  await withRetry(() =>
    prisma.backupLog.update({
      where: { id: logRow.id },
      data: {
        status: failed ? "failed" : "success",
        fileSizeBytes: compressed.length,
        r2Key: r2Result?.key ?? null,
        r2Url: r2Result?.url ?? null,
        errorMessage: r2Error ? `R2: ${r2Error}` : null,
        completedAt: new Date(),
      },
    })
  );

  return failed ? null : r2Result.url;
}

/**
 * promptForConfirmation
 * Blocks on real terminal input until the operator types the exact
 * phrase. Anything else — including empty input — aborts with no
 * changes made. This is the ONLY gate on this script; there is no
 * --yes flag and no scheduling, by design (see file header).
 */
async function promptForConfirmation() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `\nThis PERMANENTLY deletes all test/demo data (rooms, bookings, logs, content) and keeps ONLY the super-admin account and vault.\n` +
        `Type "${CONFIRMATION_PHRASE}" (exactly, case-sensitive) to continue, or anything else to abort: `
    );
    return answer === CONFIRMATION_PHRASE;
  } finally {
    rl.close();
  }
}

async function main() {
  const skipBackup = process.argv.includes("--skip-backup");

  logDbHost("DIRECT_URL", process.env.DIRECT_URL);
  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const confirmed = await promptForConfirmation();
    if (!confirmed) {
      console.log("[finalize-handoff] Aborted — confirmation phrase did not match. Nothing was touched.");
      return;
    }

    let backupUrl = null;
    if (!skipBackup) {
      console.log("[finalize-handoff] Running pre-wipe backup to Cloudflare R2…");
      backupUrl = await runPreHandoffBackup(prisma);
      if (!backupUrl) {
        console.error("[finalize-handoff] Pre-wipe backup failed — ABORTING. Nothing was truncated.");
        console.error("[finalize-handoff] Re-run with --skip-backup only if you're certain you don't need one.");
        process.exitCode = 1;
        return;
      }
      console.log(`[finalize-handoff] Backup succeeded: ${backupUrl}`);
    } else {
      console.log("[finalize-handoff] --skip-backup passed — proceeding WITHOUT a pre-wipe backup.");
    }

    const tablesToTruncate = await getTablesToTruncate(prisma);
    console.log(
      `[finalize-handoff] Truncating ${tablesToTruncate.length} table(s), preserving: ${TABLES_TO_PRESERVE.join(", ")}`
    );

    // Single transaction: either every table truncates, or none do —
    // never leave the database half-wiped.
    await prisma.$transaction(
      tablesToTruncate.map((tableName) => prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tableName}" CASCADE`))
    );
    console.log(`[finalize-handoff] Truncated ${tablesToTruncate.length} table(s) successfully.`);

    // system_settings was among the truncated tables above — it gets
    // recreated blank (via upsert) on whatever writes to it next, which
    // is exactly what we want: ownerVerifiedIp resets so the owner's
    // real first login becomes the trusted IP, and maintenanceMode /
    // breachLockdown can't carry over a stale flag from QA testing.
    // Nothing further to do here; this comment documents that on purpose.

    // Deliberately NOT calling activatePostWipeLockdown() — unlike
    // runDatabaseWipe.js, the whole point of this script is that the
    // owner can log in immediately afterward, not that the site goes
    // dark. admin_profiles was preserved above specifically so the
    // regular /superAdmin/login flow keeps working right away.

    await logSecurityEvent({
      eventType: "admin_action",
      actor: "system",
      details: `Finalize-handoff wipe completed (${skipBackup ? "WITHOUT" : "with"} pre-wipe backup). ${tablesToTruncate.length} table(s) truncated. Super-admin account and vault preserved.`,
    });

    console.log("\n[finalize-handoff] Done. The site is ready for the owner's first login at /superAdmin/login.");
  } catch (error) {
    console.error("[finalize-handoff] Failed:", error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
