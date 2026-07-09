/**
 * FILE: app/superAdmin/(protected)/backups/BackupLogsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Displays the nightly database backup history written by
 * scripts/runBackup.js (run on GitHub Actions, never by this app).
 * Strictly read-only per Rule 40.6 — there is deliberately no "Run
 * Backup Now" button here. Triggering a backup from inside the app
 * would reintroduce backup work into the live request cycle, which
 * Rule 40.1 forbids. A manual on-demand backup is run through GitHub
 * Actions' own "Run workflow" button on
 * .github/workflows/database-backup.yml, outside this app entirely.
 *
 * DATA FLOW:
 * 1. On mount and whenever the page changes, fetches
 *    GET /api/admin/backup-logs?page={page}
 * 2. DataTable renders rows with its own built-in loading/empty/error
 *    states and pagination footer
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
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
      <div className="backupsHeaderRow">
        <span className="backupsEyebrow">Disaster Recovery</span>
        <h1 className="backupsTitle">Backups</h1>
        <p className="backupsSubtitle">
          Nightly database backup history — runs automatically on GitHub Actions, completely
          separate from live site traffic. Read-only; to run one on demand, use the "Run workflow"
          button on the database-backup.yml workflow in GitHub Actions.
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={loadError}
        emptyMessage="No backups have run yet."
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={25}
        onPageChange={setPage}
      />
    </section>
  );
}
