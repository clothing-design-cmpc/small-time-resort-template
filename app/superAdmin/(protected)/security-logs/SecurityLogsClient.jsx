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

// Used inside the expanded row detail panel — includes seconds and the
// UTC offset so a full timestamp is unambiguous during incident review.
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "long",
});

// Loopback addresses show up on every request made from the same
// machine the dev server is running on — normal in local development,
// but "::1" reads like a mistake to anyone not expecting it. Labeling
// it explicitly avoids that confusion without hiding the real value.
const LOOPBACK_ADDRESSES = new Set(["::1", "127.0.0.1", "::ffff:127.0.0.1"]);

/**
 * formatIpAddress
 * Appends a "(this device)" hint next to loopback addresses so the
 * table reads clearly instead of showing a bare "::1" with no context.
 * Every other IP address is shown exactly as recorded.
 */
function formatIpAddress(ipAddress) {
  if (!ipAddress) return "—";
  return LOOPBACK_ADDRESSES.has(ipAddress) ? `${ipAddress} (this device)` : ipAddress;
}

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
    ipAddress: formatIpAddress(log.ipAddress),
    details: log.details || "—",
    createdAt: DATE_FORMATTER.format(new Date(log.createdAt)),
    // Kept off the columns list so it never renders as its own cell —
    // only renderExpandedRow reads this, for the full-detail panel below.
    raw: log,
  }));

  /**
   * renderSecurityLogDetail
   * Expanded-row content for one Security Log entry: the full user-agent
   * string (truncated to one line in the main table via StatusBadge, but
   * shown in full here), the raw event type, IP with a whois lookup link,
   * and the exact timestamp down to the second.
   */
  function renderSecurityLogDetail(row) {
    const log = row.raw;
    return (
      <div className="securityLogDetailPanel">
        <div className="securityLogDetailField">
          <span className="securityLogDetailLabel">Event type</span>
          <span className="securityLogDetailValue adminMono">{log.eventType}</span>
        </div>
        <div className="securityLogDetailField">
          <span className="securityLogDetailLabel">Actor</span>
          <span className="securityLogDetailValue">{log.actor || "— (not authenticated)"}</span>
        </div>
        <div className="securityLogDetailField">
          <span className="securityLogDetailLabel">IP address</span>
          <span className="securityLogDetailValue adminMono">
            {!log.ipAddress ? (
              "—"
            ) : LOOPBACK_ADDRESSES.has(log.ipAddress) ? (
              // A whois lookup on a loopback address returns nothing
              // useful — it just means "this same machine," so it's
              // labeled directly instead of offering a dead-end link.
              <span>{log.ipAddress} (this device — no whois lookup available)</span>
            ) : (
              <a
                href={`https://whois.com/whois/${log.ipAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="securityLogDetailLink"
                onClick={(event) => event.stopPropagation()}
              >
                {log.ipAddress} ↗
              </a>
            )}
          </span>
        </div>
        <div className="securityLogDetailField">
          <span className="securityLogDetailLabel">Timestamp</span>
          <span className="securityLogDetailValue adminMono">{FULL_DATE_FORMATTER.format(new Date(log.createdAt))}</span>
        </div>
        <div className="securityLogDetailField securityLogDetailField--full">
          <span className="securityLogDetailLabel">Full user-agent string</span>
          <span className="securityLogDetailValue securityLogDetailValue--wrap adminMono">
            {log.userAgent || "— (not recorded)"}
          </span>
        </div>
        <div className="securityLogDetailField securityLogDetailField--full">
          <span className="securityLogDetailLabel">Full details</span>
          <span className="securityLogDetailValue securityLogDetailValue--wrap">{log.details || "—"}</span>
        </div>
      </div>
    );
  }

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
        pageSize={10}
        onPageChange={setPage}
        renderExpandedRow={renderSecurityLogDetail}
      />
    </section>
  );
}
