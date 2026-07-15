/**
 * FILE: scripts/purgeSecurityLogs.js
 * PURPOSE:
 * GDPR/data-retention job (Rule 38.9) — permanently deletes SecurityLog
 * rows older than SECURITY_LOG_RETENTION_DAYS. SecurityLog rows contain
 * IP addresses and resolved geolocation, which are personal data under
 * GDPR Art. 4(1); keeping them indefinitely has no legitimate purpose
 * once the retention window has passed.
 *
 * *** THIS SCRIPT IS DELIBERATELY NOT PART OF THE LIVE APP. ***
 * Same pattern as scripts/runBackup.js — it runs on a schedule via
 * .github/workflows/security-log-retention.yml (separate infrastructure
 * from the app server), so a purge running has zero effect on request
 * latency for real guests/admins.
 *
 * DATA FLOW:
 * 1. Reads SECURITY_LOG_RETENTION_DAYS from the environment (defaults
 *    to 90 if unset, so a missing env var fails safe toward keeping
 *    data longer rather than deleting too aggressively)
 * 2. Deletes every SecurityLog row with createdAt older than
 *    (now - retentionDays)
 * 3. Writes one summary SecurityLog row of its own (eventType:
 *    "system_retention_purge") recording how many rows were deleted —
 *    this row is itself subject to the same retention window later
 *
 * USAGE: npm run purge-security-logs   (reads DATABASE_URL and
 * SECURITY_LOG_RETENTION_DAYS from the environment — GitHub Actions
 * injects these from repo secrets/variables; locally, `.env.local`
 * covers it if you want to test manually)
 */
import "dotenv/config";
// @prisma/client is a CommonJS module — Node's ESM loader (used when
// GitHub Actions runs this script directly with `node`, unlike Next.js's
// bundler which papers over this) can't statically resolve named exports
// from it, so `import { PrismaClient } from "@prisma/client"` throws
// "Named export 'PrismaClient' not found" at runtime. Default-import the
// whole module and destructure instead.
import prismaPkg from "@prisma/client";
const { PrismaClient } = prismaPkg;
import { PrismaPg } from "@prisma/adapter-pg";

const DEFAULT_RETENTION_DAYS = 90;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function purgeSecurityLogs() {
  const retentionDays = Number.parseInt(process.env.SECURITY_LOG_RETENTION_DAYS, 10) || DEFAULT_RETENTION_DAYS;
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  console.log(`[purgeSecurityLogs] Retention window: ${retentionDays} days. Deleting rows older than ${cutoffDate.toISOString()}...`);

  try {
    const { count } = await prisma.securityLog.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });

    console.log(`[purgeSecurityLogs] Deleted ${count} row(s) older than the retention window.`);

    // Record the purge itself for audit purposes — actor is "system"
    // since no admin session triggered it, only the scheduled job.
    await prisma.securityLog.create({
      data: {
        eventType: "system_retention_purge",
        actor: "system",
        details: `Purged ${count} SecurityLog row(s) older than ${retentionDays} days (GDPR retention policy).`,
      },
    });
  } catch (error) {
    console.error("[purgeSecurityLogs] Failed to purge security logs:", error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

purgeSecurityLogs();