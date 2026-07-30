/**
 * FILE: app/superAdmin/(protected)/audit-logs/AuditLogsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Displays the AuditLog table: who created/updated/deleted which piece
 * of content (rooms, amenities, shop products, activities,
 * testimonials, gallery, policies, homepage, booking rules, blackout
 * dates, seasonal pricing) — separate from Security Logs (login
 * attempts, anomalies, attacks — see Rule 38.1's separation).
 *
 * DATA FLOW:
 * 1. On mount and whenever page/action/targetType filter changes,
 *    fetches GET /api/admin/audit-logs?page=&action=&targetType=
 * 2. DataTable renders the rows with its own built-in loading/empty/
 *    error states and pagination footer
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import "./AuditLogs.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// Used inside the expanded row detail panel — includes seconds and the
// UTC offset so a full timestamp is unambiguous during a review.
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "long",
});

const ACTION_FILTERS = [
  { value: "all", label: "All actions" },
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "deleted", label: "Deleted" },
];

const columns = [
  { key: "action", label: "Action" },
  { key: "target", label: "Target" },
  { key: "actor", label: "Actor" },
  { key: "createdAt", label: "When", mono: true },
];

export default function AuditLogsClient() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [actionFilter, setActionFilter] = useState("all");
  const [targetTypeFilter, setTargetTypeFilter] = useState("all");
  const [targetTypes, setTargetTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams({
        page: String(page),
        action: actionFilter,
        targetType: targetTypeFilter,
      });
      const response = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      const result = await response.json();

      if (!result.success) {
        setLoadError(result.message || "Failed to load audit logs. Please try again.");
        return;
      }

      setLogs(result.data.logs);
      setTotalPages(result.data.totalPages);
      setTotalCount(result.data.totalCount);
      setTargetTypes(result.data.targetTypes);
    } catch {
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [page, actionFilter, targetTypeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Changing any filter always jumps back to page 1 — staying on, say,
  // page 4 of a filtered-down list would usually just show an empty page.
  function handleActionChange(nextFilter) {
    setActionFilter(nextFilter);
    setPage(1);
  }
  function handleTargetTypeChange(event) {
    setTargetTypeFilter(event.target.value);
    setPage(1);
  }

  const rows = logs.map((log) => ({
    id: log.id,
    action: <StatusBadge status={log.action} />,
    target: (
      <span className="auditLogTargetCell">
        <span className="auditLogTargetType">{log.targetType}</span>
        <span className="auditLogTargetName">{log.targetName || "—"}</span>
      </span>
    ),
    actor: log.actor || "— (system)",
    createdAt: DATE_FORMATTER.format(new Date(log.createdAt)),
    // Kept off the columns list so it never renders as its own cell —
    // only renderExpandedRow reads this, for the full-detail panel below.
    raw: log,
  }));

  /**
   * renderAuditLogDetail
   * Expanded-row content for one Audit Log entry: the full details
   * summary, target id, IP address, and the exact timestamp down to
   * the second.
   */
  function renderAuditLogDetail(row) {
    const log = row.raw;
    return (
      <div className="auditLogDetailPanel">
        <div className="auditLogDetailField">
          <span className="auditLogDetailLabel">Action</span>
          <span className="auditLogDetailValue">
            <StatusBadge status={log.action} /> on {log.targetType}
          </span>
        </div>
        <div className="auditLogDetailField">
          <span className="auditLogDetailLabel">Actor</span>
          <span className="auditLogDetailValue">{log.actor || "— (system)"}</span>
        </div>
        <div className="auditLogDetailField">
          <span className="auditLogDetailLabel">Target ID</span>
          <span className="auditLogDetailValue" style={{ fontFamily: "var(--font-admin-mono), monospace" }}>
            {log.targetId || "— (deleted)"}
          </span>
        </div>
        <div className="auditLogDetailField">
          <span className="auditLogDetailLabel">IP address</span>
          <span className="auditLogDetailValue" style={{ fontFamily: "var(--font-admin-mono), monospace" }}>
            {log.ipAddress || "—"}
          </span>
        </div>
        <div className="auditLogDetailField">
          <span className="auditLogDetailLabel">Timestamp</span>
          <span className="auditLogDetailValue" style={{ fontFamily: "var(--font-admin-mono), monospace" }}>
            {FULL_DATE_FORMATTER.format(new Date(log.createdAt))}
          </span>
        </div>
        <div className="auditLogDetailField auditLogDetailField--full">
          <span className="auditLogDetailLabel">Full details</span>
          <span className="auditLogDetailValue auditLogDetailValue--wrap">{log.details || "—"}</span>
        </div>
      </div>
    );
  }

  return (
    <section className="auditLogsSection">
      <div className="auditLogsHeaderRow">
        <span className="auditLogsEyebrow">Content Trail</span>
        <h1 className="auditLogsTitle">Audit Logs</h1>
        <p className="auditLogsSubtitle">
          Who created, updated, or deleted which piece of content — rooms, amenities, shop
          products, activities, testimonials, gallery, policies, homepage, and booking rules —
          newest first.
        </p>
      </div>

      <div className="auditLogsToolbar">
        <div className="auditLogsFilterRow">
          {ACTION_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`auditLogsFilterPill${actionFilter === filter.value ? " auditLogsFilterPillActive" : ""}`}
              onClick={() => handleActionChange(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="auditLogsSelectRow">
          <label className="auditLogsSelectLabel">
            Target type
            <select className="auditLogsSelect" value={targetTypeFilter} onChange={handleTargetTypeChange}>
              <option value="all">All target types</option>
              {targetTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={loadError}
        emptyMessage="No audit log entries match these filters."
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={10}
        onPageChange={setPage}
        renderExpandedRow={renderAuditLogDetail}
      />
    </section>
  );
}
