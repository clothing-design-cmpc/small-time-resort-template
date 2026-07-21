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
 * 1. On mount, on every page change, and every 30s, GET
 *    /api/admin/vault-activity-log?page=N — vault-session only (see
 *    that route's header comment). The 30s poll only refires while
 *    on page 1 — polling a page the admin has paged away from would
 *    either silently reset them back to page 1's data or require
 *    re-fetching whatever page they're on every 30s for no reason,
 *    so it's skipped entirely past page 1.
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
const DEFAULT_PAGE_SIZE = 20;

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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pollIntervalRef = useRef(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  const fetchActivityLog = useCallback(
    async (targetPage) => {
      try {
        const response = await axios.get("/api/admin/vault-activity-log", {
          params: { page: targetPage },
        });
        const { logs: fetchedLogs, totalPages: fetchedTotalPages, totalCount: fetchedTotalCount } =
          response.data.data;
        setLogs(fetchedLogs);
        setTotalPages(fetchedTotalPages);
        setTotalCount(fetchedTotalCount);
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
    },
    [router, vaultSlug]
  );

  // Page changes always fetch immediately, regardless of the poll below.
  useEffect(() => {
    setIsLoading(true);
    fetchActivityLog(page);
  }, [page, fetchActivityLog]);

  // The 30s background poll only refreshes page 1 — see the DATA FLOW
  // header comment above for why paging away suspends it.
  useEffect(() => {
    pollIntervalRef.current = setInterval(() => {
      if (pageRef.current === 1) fetchActivityLog(1);
    }, POLL_INTERVAL_MS);
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
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={setPage}
      />
    </section>
  );
}
