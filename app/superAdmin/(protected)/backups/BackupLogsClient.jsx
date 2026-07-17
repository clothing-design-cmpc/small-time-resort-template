/**
 * FILE: app/superAdmin/(protected)/backups/BackupLogsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Displays the nightly database backup history written by
 * scripts/runBackup.js (run on GitHub Actions, never by this app), a
 * "Run Backup Now" button, and an "Import SQL to Fix Database" section.
 * Neither action runs pg_dump/psql inside this app's own request cycle
 * (Rule 40.1) — both remotely dispatch a GitHub Actions workflow via
 * services/github.js and the actual DB work still happens entirely on
 * GitHub's runners. This page only uploads, triggers, and displays.
 *
 * DATA FLOW:
 * 1. On mount and whenever the page changes, fetches
 *    GET /api/admin/backup-logs?page={page}
 * 2. "Run Backup Now" -> POST /api/admin/backup-logs/trigger, which
 *    dispatches database-backup.yml
 * 3. "Import SQL" -> confirms via modal, then POST /api/admin/sql-import
 *    (multipart file upload), which uploads to R2 and dispatches
 *    database-restore.yml
 * 4. DataTable renders both histories with their own built-in
 *    loading/empty/error states and pagination footers
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import WipeDatabaseSection from "@/components/superAdmin/WipeDatabaseSection";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import { useSqlImport } from "@/hooks/useSqlImport";
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

const IMPORT_LOG_COLUMNS = [
  { key: "status", label: "Status" },
  { key: "fileName", label: "File" },
  { key: "startedAt", label: "Started", mono: true },
  { key: "fileSize", label: "Size", mono: true },
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

  // "Import SQL" state - the picked file waits here until the admin
  // confirms the destructive-action modal, then the upload fires.
  const [pendingImportFile, setPendingImportFile] = useState(null);
  const fileInputRef = useRef(null);

  const { toasts, showToast, dismissToast } = useToast();
  const {
    importLogs,
    page: importPage,
    setPage: setImportPage,
    totalPages: importTotalPages,
    totalCount: importTotalCount,
    isLoading: isImportHistoryLoading,
    loadError: importLoadError,
    uploadSqlFile,
  } = useSqlImport();

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

  /**
   * handleFileSelected
   * Fired when the admin picks a file from the hidden file input.
   * Holds it in state so ConfirmationModal can show the exact file
   * name before anything is actually uploaded (Rule 34.4).
   */
  function handleFileSelected(event) {
    const file = event.target.files?.[0];
    if (file) setPendingImportFile(file);
  }

  /**
   * handleConfirmImport
   * Runs after the admin confirms the destructive-action modal.
   * Uploads the file, shows the resulting toast, and clears the
   * pending file + file input so the same file can be picked again later.
   */
  async function handleConfirmImport() {
    try {
      const result = await uploadSqlFile(pendingImportFile);
      showToast(`✓ ${result.message}`, "success");
    } catch (error) {
      const message = error.response?.data?.message || "Failed to start the import. Please try again.";
      showToast(`✕ ${message}`, "error");
    } finally {
      setPendingImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const importRows = importLogs.map((log) => ({
    id: log.id,
    status: <StatusBadge status={log.status} />,
    fileName: log.fileName,
    startedAt: DATE_FORMATTER.format(new Date(log.startedAt)),
    fileSize: formatFileSize(log.fileSizeBytes),
    details: log.errorMessage || (log.status === "running" ? "In progress…" : "—"),
  }));

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

      <div className="backupsHeaderRow backupsImportSection">
        <span className="backupsEyebrow">Restore</span>
        <h2 className="backupsTitle">Import SQL to Fix Database</h2>
        <p className="backupsSubtitle">
          Upload a <span className="adminMono">.sql</span> or <span className="adminMono">.sql.gz</span>{" "}
          file (usually one downloaded from a previous backup's Google Drive link) to restore the
          database from it. The file is applied on GitHub's servers, not this one - you'll see the
          result appear in the history below once it finishes.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".sql,.gz"
          onChange={handleFileSelected}
          className="backupsFileInput"
          id="sqlImportFileInput"
        />
        <label htmlFor="sqlImportFileInput" className="backupsRunNowButton backupsFileInputLabel">
          Choose SQL File…
        </label>
      </div>

      <DataTable
        columns={IMPORT_LOG_COLUMNS}
        rows={importRows}
        isLoading={isImportHistoryLoading}
        error={importLoadError}
        emptyMessage="No SQL imports have been run yet."
        page={importPage}
        totalPages={importTotalPages}
        totalCount={importTotalCount}
        pageSize={10}
        onPageChange={setImportPage}
      />

      <ConfirmationModal
        isOpen={Boolean(pendingImportFile)}
        title="Import SQL and Overwrite Database?"
        description={
          pendingImportFile
            ? `This will apply "${pendingImportFile.name}" directly to the live database. All current data affected by this file will be overwritten. This cannot be undone.`
            : ""
        }
        confirmLabel="Import & Restore"
        onConfirm={handleConfirmImport}
        onCancel={() => {
          setPendingImportFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />

      <WipeDatabaseSection />
    </section>
  );
}
