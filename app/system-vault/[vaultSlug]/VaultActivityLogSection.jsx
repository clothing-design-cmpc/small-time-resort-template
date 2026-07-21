/**
 * FILE: app/system-vault/[vaultSlug]/VaultActivityLogSection.jsx
 * ROLE: Standalone — rendered inside VaultDangerZoneSection.jsx only
 *
 * PURPOSE:
 * The Danger Zone's own audit trail: what happened in the vault and
 * when — a wipe was scheduled, truncated early, cancelled, a lockdown
 * was ended, the vault was locked/unlocked, an emailed code was sent
 * or rejected, the passphrase auto-rotated after a breach, and so on.
 * Reuses the shared DataTable (components/superAdmin/DataTable.jsx)
 * so loading skeletons, the error state, and the empty state (no
 * buttons, just a plain centered message — Rule 25.3) come for free
 * instead of being rebuilt by hand.
 *
 * DATA FLOW:
 * 1. On mount and every 30s, GET /api/admin/vault-activity-log —
 *    vault-session only (see that route's header comment)
 * 2. Each row's eventType renders through the shared StatusBadge so
 *    the same color/label already used on the regular Security Logs
 *    page (app/superAdmin/(protected)/security-logs) is reused here
 * 3. A 401 means the vault session expired mid-visit — same handling
 *    as every other GET in RecoveryClient.jsx: back to this slug's
 *    own /login screen
 *
 * TOASTS: showToast is passed down as a prop, same pattern
 * VaultDangerZoneSection.jsx already uses for its own actions.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import "./VaultActivityLogSection.css";

const POLL_INTERVAL_MS = 30 * 1000;

const DATE_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});

const COLUMNS = [
  { key: "event", label: "Event" },
  { key: "details", label: "What happened" },
  { key: "when", label: "When", align: "right" },
];

/** Maps a raw SecurityLog row into the shape DataTable's columns expect. */
function buildActivityLogRow(log) {
  return {
    id: log.id,
    event: <StatusBadge status={log.eventType} />,
    details: log.details || "—",
    when: DATE_FORMATTER.format(new Date(log.createdAt)),
  };
}

export default function VaultActivityLogSection({ showToast }) {
  const router = useRouter();
  const { vaultSlug } = useParams();

  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const pollIntervalRef = useRef(null);

  const fetchActivityLog = useCallback(async () => {
    try {
      const response = await axios.get("/api/admin/vault-activity-log");
      setLogs(response.data.data.logs);
      setLoadError(null);
    } catch (error) {
      // 401 here means the vault session expired (30-minute window) or
      // was never valid to begin with — same redirect every other GET
      // in this recovery flow already falls back to.
      if (error.response?.status === 401) {
        router.push(`/system-vault/${vaultSlug}/login`);
        return;
      }
      setLoadError(error);
      showToast("✕ Couldn't load the vault activity log.", "error");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, vaultSlug]);

  useEffect(() => {
    fetchActivityLog();
    pollIntervalRef.current = setInterval(fetchActivityLog, POLL_INTERVAL_MS);
    return () => clearInterval(pollIntervalRef.current);
  }, [fetchActivityLog]);

  const rows = logs.map(buildActivityLogRow);

  return (
    <section className="vaultActivityLogSection">
      <div className="vaultActivityLogHeader">
        <h3 className="vaultActivityLogTitle">Activity Log</h3>
        <p className="vaultActivityLogSubtitle">
          Every wipe scheduled, truncated, or cancelled here, plus lockdown and vault-access
          events — newest first.
        </p>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={rows}
        isLoading={isLoading}
        error={loadError}
        emptyMessage="No vault activity yet. Actions taken in this Danger Zone will show up here."
      />
    </section>
  );
}
