/**
 * FILE: app/superAdmin/(protected)/backups/BackupLogsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Displays the nightly database backup history written by
 * scripts/runBackup.js (run on GitHub Actions, never by this app), a
 * "Run Backup Now" button, and the Danger Zone (WipeDatabaseSection).
 * "Import SQL to Fix Database" has been removed from this page — it's a
 * whole-database overwrite, so it now lives only on the standalone vault
 * Recovery page, gated by the passphrase + emailed OTP flow rather than
 * the regular super-admin session every admin has.
 * Neither the nightly backup nor "Run Backup Now" runs pg_dump inside
 * this app's own request cycle (Rule 40.1) — "Run Backup Now" remotely
 * dispatches a GitHub Actions workflow via services/github.js and the
 * actual DB work still happens entirely on GitHub's runners. This page
 * only triggers and displays.
 *
 * DATA FLOW:
 * 1. On mount and whenever the page changes, fetches
 *    GET /api/admin/backup-logs?page={page}
 * 2. "Run Backup Now" -> POST /api/admin/backup-logs/trigger, which
 *    creates the BackupLog row synchronously (status "running") and
 *    dispatches manual-database-backup.yml with that row's id. The
 *    returned row is prepended to the table immediately — no delay, no
 *    manual refresh needed to see that it started.
 * 3. DataTable renders the history with its own built-in
 *    loading/empty/error states and pagination footer
 *
 * REALTIME "RUNNING" ROWS:
 * A row created at step 2 sits at status "running" until GitHub's
 * runner finishes scripts/runBackup.js and writes the final
 * success/failed status — that used to only ever show up after the
 * admin manually refreshed the page. Whenever the CURRENT page has at
 * least one "running" row, a 4-second poll (same interval as Rule
 * 30.4's pending-payments pattern) silently re-fetches this page in
 * the background — no loading spinner, no layout jump — until none of
 * the visible rows are "running" anymore, then it stops on its own.
 *
 * TOASTS: this component owns the single useToast instance and
 * <ToastStack> for the whole Backups page (Rule 22.2) — showToast is
 * passed down to WipeDatabaseSection as a prop rather than that
 * component creating its own instance (Rule 22.4), which previously
 * put two independent fixed-position toast stacks at the same
 * top-center coordinates and produced the garbled Danger Zone banner.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import WipeDatabaseSection from "@/components/superAdmin/WipeDatabaseSection";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import "./Backups.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Formats a byte count as a human-readable size (e.g. "4.2 MB"). */
function formatFileSize(bytes) {
  if (!bytes) return "—";
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1 ? `${megabytes.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

/**
 * getNextScheduledRunLabel
 * The workflow runs at 18:00 UTC (2:00 AM Philippine time) every day.
 * Computes a friendly "tonight at 2:00 AM" / "tomorrow at 2:00 AM"
 * label so the empty state explains WHEN the first backup will
 * actually appear, instead of just saying "no backups yet" with no
 * context for whether that's expected or broken.
 */
function getNextScheduledRunLabel() {
  const now = new Date();
  const nextRunUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 18, 0, 0));
  if (nextRunUtc <= now) nextRunUtc.setUTCDate(nextRunUtc.getUTCDate() + 1);

  const isTonight = nextRunUtc.getUTCDate() === now.getUTCDate();
  return `${isTonight ? "tonight" : "tomorrow"} at 2:00 AM (Philippine time)`;
}

/**
 * buildBackupLogRow
 * Shapes one BackupLog record into the row object DataTable expects.
 * Shared by the mapped history list AND by handleRunBackupNow's
 * optimistic prepend, so the row that appears instantly on click looks
 * pixel-identical to the same row once it's re-fetched from the server.
 */
function buildBackupLogRow(log) {
  return {
    id: log.id,
    status: <StatusBadge status={log.status} />,
    // Falls back to "manual" display via StatusBadge's own unknown-key
    // fallback if a row predates this field (log.triggerSource will be
    // undefined on rows written before the migration, not null) —
    // never crashes on old data.
    source: <StatusBadge status={log.triggerSource || "manual"} />,
    startedAt: DATE_FORMATTER.format(new Date(log.startedAt)),
    fileSize: formatFileSize(log.fileSizeBytes),
    destinations: (
      <div className="backupsDestinationLinks">
        {log.r2Url ? (
          <a href={log.r2Url} target="_blank" rel="noopener noreferrer" className="backupsDestinationLink">
            R2 ↗
          </a>
        ) : (
          <span className="backupsDestinationMissing">R2 —</span>
        )}
        {log.driveViewLink ? (
          <a href={log.driveViewLink} target="_blank" rel="noopener noreferrer" className="backupsDestinationLink">
            Drive ↗
          </a>
        ) : (
          <span className="backupsDestinationMissing">Drive —</span>
        )}
      </div>
    ),
    details: log.errorMessage || (log.status === "running" ? "In progress…" : "—"),
  };
}

const columns = [
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
  { key: "startedAt", label: "Started", mono: true },
  { key: "fileSize", label: "Size", mono: true },
  { key: "destinations", label: "Destinations" },
  { key: "details", label: "Details" },
];

/**
 * parseJsonResponse
 * Same reasoning as WipeDatabaseSection's copy: a response that came
 * back but isn't valid JSON (a crashed route's HTML error page) is a
 * server-side problem, not the same thing as fetch() itself failing to
 * reach the server at all — each gets its own honest message.
 */
async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    throw new Error(
      response.ok
        ? "The server sent back an unexpected response. Please try again."
        : `The server returned an error (${response.status}). Please try again.`
    );
  }
}

export default function BackupLogsClient() {
  const [backupLogs, setBackupLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // "Run Backup Now" state - disabled while the trigger request is
  // in flight so a double-click can't fire two workflow dispatches.
  const [isTriggeringBackup, setIsTriggeringBackup] = useState(false);

  const { toasts, showToast, dismissToast } = useToast();

  /**
   * fetchBackupLogs
   * @param {boolean} silent - when true (background poll), skips the
   *   loading spinner and error banner so a "running" row quietly
   *   flips to "success"/"failed" without flashing the whole table.
   *   A silent poll that fails just gets retried on the next tick
   *   instead of surfacing an error — only the initial/manual load
   *   shows the error state.
   */
  const fetchBackupLogs = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
      setLoadError(null);
    }

    try {
      const response = await fetch(`/api/admin/backup-logs?page=${page}`);
      const result = await parseJsonResponse(response);

      if (!result.success) {
        if (!silent) setLoadError(result.message || "Failed to load backup history. Please try again.");
        return;
      }

      setBackupLogs(result.data.backupLogs);
      setTotalPages(result.data.totalPages);
      setTotalCount(result.data.totalCount);
    } catch (error) {
      if (!silent) {
        setLoadError(error.message || "We couldn't reach the server. Check your connection and try again.");
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchBackupLogs();
  }, [fetchBackupLogs]);

  // Whether the currently displayed page still has a row stuck at
  // "running" — the only condition that needs a background poll at all.
  const hasRunningRow = backupLogs.some((log) => log.status === "running");

  // Background poll — only ticks while a "running" row is visible on
  // this page, and tears itself down the moment that stops being true
  // (rows resolve to success/failed) or the admin navigates away.
  useEffect(() => {
    if (!hasRunningRow) return;

    const intervalId = setInterval(() => {
      fetchBackupLogs(true);
    }, 4000);

    return () => clearInterval(intervalId);
  }, [hasRunningRow, fetchBackupLogs]);

  /**
   * handleRunBackupNow
   * Fires the manual backup trigger. The route now creates the
   * BackupLog row synchronously and returns it — prepending it here
   * puts it on screen the instant the click resolves, instead of the
   * admin having to wait for GitHub's runner to start and refresh the
   * page to see anything happened. Only prepends when already on page
   * 1 (a new row belongs at the top of the newest-first list); on any
   * other page the toast alone confirms it started, since inserting it
   * there would just be a row that doesn't belong on that page.
   */
  async function handleRunBackupNow() {
    setIsTriggeringBackup(true);
    try {
      const response = await axios.post("/api/admin/backup-logs/trigger");
      const newLog = response.data?.data?.backupLog;

      if (newLog && page === 1) {
        setBackupLogs((currentLogs) => [newLog, ...currentLogs]);
        setTotalCount((currentCount) => currentCount + 1);
      }

      showToast(`✓ ${response.data.message}`, "success");
    } catch (error) {
      const message = error.response?.data?.message || "Failed to start the backup. Please try again.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setIsTriggeringBackup(false);
    }
  }

  const rows = backupLogs.map(buildBackupLogRow);

  return (
    <section className="backupsSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="backupsHeaderRow">
        <span className="backupsEyebrow">Disaster Recovery</span>
        <h1 className="backupsTitle">Backups</h1>
        <p className="backupsSubtitle">
          Every night at 2:00 AM (Philippine time), GitHub Actions runs a database backup on its
          own servers, completely separate from the live site, and the result appears below. You
          can also start one early with the button below - it still runs on GitHub's servers, not
          this one, so it can never slow down the live site.
        </p>
        <button
          type="button"
          className="backupsRunNowButton"
          onClick={handleRunBackupNow}
          disabled={isTriggeringBackup}
        >
          {isTriggeringBackup ? "Starting…" : "Run Backup Now"}
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={loadError}
        emptyMessage={`No backups have run yet - that's expected on a brand-new project. The first one runs automatically ${getNextScheduledRunLabel()}; this page will fill in on its own after that.`}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={10}
        onPageChange={setPage}
      />

      <WipeDatabaseSection showToast={showToast} />
    </section>
  );
}
