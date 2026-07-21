/**
 * FILE: services/staleRunWatchdog.js
 * PURPOSE:
 * Shared "check on read" watchdog for BackupLog and SqlImportLog rows.
 * Both models follow the same create-running -> update-on-completion
 * pattern (Rule 40.4), with every normal completion path (success or
 * failure) wrapped in try/catch that updates the row. The gap this
 * closes: if the GitHub Actions runner itself crashes, gets cancelled,
 * or times out BEFORE reaching any of those catch blocks, the row is
 * left in "running" forever with no code path that ever revisits it.
 *
 * This runs lazily whenever either history list is fetched (Backups
 * page, Fix SQL history) rather than as its own scheduled job — no new
 * GitHub Actions workflow needed, and the fix is applied the next time
 * a super-admin actually looks at the list, which is the only time it
 * matters anyway.
 */
import { prisma } from "@/services/prisma";

const STALE_RUNNING_MAX_MINUTES = 30;
const STALE_MESSAGE =
  "Runner did not report completion within 30 minutes — likely crashed, was cancelled, or timed out.";

/**
 * markStaleRunningRowsAsFailed
 * Flips any row still "running" past STALE_RUNNING_MAX_MINUTES to
 * "failed" with an explanatory errorMessage and a completedAt
 * timestamp, so the UI stops showing it as perpetually in-progress.
 * Best-effort — never throws, since a watchdog miss should never break
 * the read it's attached to (same principle as Rule 38's logging).
 *
 * @param {object} delegate - a Prisma model delegate with the same
 *   shape as BackupLog/SqlImportLog (status, startedAt, completedAt,
 *   errorMessage), e.g. prisma.backupLog or prisma.sqlImportLog.
 * @param {string} label - short name for log lines, e.g. "backupLog".
 */
export async function markStaleRunningRowsAsFailed(delegate, label) {
  try {
    const staleCutoff = new Date(Date.now() - STALE_RUNNING_MAX_MINUTES * 60 * 1000);

    const result = await delegate.updateMany({
      where: {
        status: "running",
        startedAt: { lt: staleCutoff },
      },
      data: {
        status: "failed",
        errorMessage: STALE_MESSAGE,
        completedAt: new Date(),
      },
    });

    if (result.count > 0) {
      console.warn(`[staleRunWatchdog] Marked ${result.count} stale "${label}" row(s) as failed.`);
    }
  } catch (error) {
    // Never let a watchdog failure break the list it's protecting.
    console.error(`[staleRunWatchdog] Failed to check "${label}" for stale rows:`, error.message);
  }
}
