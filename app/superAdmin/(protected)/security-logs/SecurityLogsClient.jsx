/**
 * FILE: app/superAdmin/(protected)/security-logs/SecurityLogsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Displays the append-only SecurityLog table: login attempts (success/
 * failed), denied admin access, rate limit hits, and sensitive admin
 * actions (e.g. booking cancellations) — so an admin reviewing a
 * possible break-in can see exactly what happened, from where, and when.
 *
 * DATA FLOW:
 * 1. On mount and whenever page/eventType filter changes, fetches
 *    GET /api/admin/security-logs?page={page}&eventType={eventType}
 * 2. DataTable (components/superAdmin/DataTable) renders the rows with
 *    its own built-in loading/empty/error states and pagination footer
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import "./SecurityLogs.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const EVENT_TYPE_FILTERS = [
  { value: "all", label: "All events" },
  { value: "login_success", label: "Login Success" },
  { value: "login_failed", label: "Login Failed" },
  { value: "admin_login_denied", label: "Access Denied" },
  { value: "rate_limit_hit", label: "Rate Limited" },
  { value: "admin_action", label: "Admin Action" },
  { value: "sql_injection_attempt", label: "SQLi Attempt" },
];

const columns = [
  { key: "eventType", label: "Event" },
  { key: "actor", label: "Actor" },
  { key: "ipAddress", label: "IP Address", mono: true },
  { key: "details", label: "Details" },
  { key: "createdAt", label: "When", mono: true },
];

export default function SecurityLogsClient() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(`/api/admin/security-logs?page=${page}&eventType=${eventTypeFilter}`);
      const result = await response.json();

      if (!result.success) {
        setLoadError(result.message || "Failed to load security logs. Please try again.");
        return;
      }

      setLogs(result.data.logs);
      setTotalPages(result.data.totalPages);
      setTotalCount(result.data.totalCount);
    } catch {
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [page, eventTypeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Changing the filter always jumps back to page 1 — staying on, say,
  // page 4 of a filtered-down list would usually just show an empty page.
  function handleFilterChange(nextFilter) {
    setEventTypeFilter(nextFilter);
    setPage(1);
  }

  const rows = logs.map((log) => ({
    id: log.id,
    eventType: <StatusBadge status={log.eventType} />,
    actor: log.actor || "—",
    ipAddress: log.ipAddress || "—",
    details: log.details || "—",
    createdAt: DATE_FORMATTER.format(new Date(log.createdAt)),
  }));

  return (
    <section className="securityLogsSection">
      <div className="securityLogsHeaderRow">
        <span className="securityLogsEyebrow">Audit Trail</span>
        <h1 className="securityLogsTitle">Security Logs</h1>
        <p className="securityLogsSubtitle">
          Login attempts, denied admin access, rate limit hits, and sensitive admin actions —
          newest first.
        </p>
      </div>

      <div className="securityLogsFilterRow">
        {EVENT_TYPE_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`securityLogsFilterPill${eventTypeFilter === filter.value ? " securityLogsFilterPillActive" : ""}`}
            onClick={() => handleFilterChange(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={loadError}
        emptyMessage="No security events recorded yet."
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={25}
        onPageChange={setPage}
      />
    </section>
  );
}
