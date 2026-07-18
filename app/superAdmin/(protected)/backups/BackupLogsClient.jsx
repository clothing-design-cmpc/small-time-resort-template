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
 *    dispatches database-backup.yml
 * 3. DataTable renders the history with its own built-in
 *    loading/empty/error states and pagination footer
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

const columns = [
  { key: "status", label: "Status" },
  { key: "startedAt", label: "Started", mono: true },
  { key: "fileSize", label: "Size", mono: true },
  { key: "destinations", label: "Destinations" },
  { key: "details", label: "Details" },
];

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

  const fetchBackupLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(`/api/admin/backup-logs?page=${page}`);
      const result = await response.json();

      if (!result.success) {
        setLoadError(result.message || "Failed to load backup history. Please try again.");
        return;
      }

      setBackupLogs(result.data.backupLogs);
      setTotalPages(result.data.totalPages);
      setTotalCount(result.data.totalCount);
    } catch {
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchBackupLogs();
  }, [fetchBackupLogs]);

  /**
   * handleRunBackupNow
   * Fires the manual backup trigger. Success just means the workflow
   * was dispatched - the actual BackupLog row appears a bit later once
   * GitHub's runner finishes, so the toast tells the admin to refresh
   * rather than pretending it's done already.
   */
  async function handleRunBackupNow() {
    setIsTriggeringBackup(true);
    try {
      const response = await axios.post("/api/admin/backup-logs/trigger");
      showToast(`✓ ${response.data.message}`, "success");
    } catch (error) {
      const message = error.response?.data?.message || "Failed to start the backup. Please try again.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setIsTriggeringBackup(false);
    }
  }

  const rows = backupLogs.map((log) => ({
    id: log.id,
    status: <StatusBadge status={log.status} />,
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
  }));

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

      <WipeDatabaseSection />
    </section>
  );
}
