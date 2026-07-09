/**
 * FILE: app/superAdmin/(protected)/visitor-logs/VisitorLogsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Displays the VisitorLog table: every visitor page view plus notable
 * transactions (e.g. submitting a booking), with IP address and
 * best-effort city/country — separate from Security Logs (that page is
 * an incident-focused audit trail; this one is traffic/transaction
 * analytics, so mixing them would bury real security events in noise).
 *
 * DATA FLOW:
 * 1. On mount and whenever page/action filter changes, fetches
 *    GET /api/admin/visitor-logs?page={page}&action={action}
 * 2. DataTable renders the rows with its own built-in loading/empty/
 *    error states and pagination footer
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/superAdmin/DataTable";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import "./VisitorLogs.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const ACTION_FILTERS = [
  { value: "all", label: "All activity" },
  { value: "page_view", label: "Page Views" },
  { value: "booking_submitted", label: "Bookings Submitted" },
];

const columns = [
  { key: "action", label: "Action" },
  { key: "path", label: "Page" },
  { key: "location", label: "Location" },
  { key: "ipAddress", label: "IP Address", mono: true },
  { key: "details", label: "Details" },
  { key: "createdAt", label: "When", mono: true },
];

function formatLocation(city, country) {
  if (!city && !country) return "—";
  return [city, country].filter(Boolean).join(", ");
}

export default function VisitorLogsClient() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [actionFilter, setActionFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(`/api/admin/visitor-logs?page=${page}&action=${actionFilter}`);
      const result = await response.json();

      if (!result.success) {
        setLoadError(result.message || "Failed to load visitor logs. Please try again.");
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
  }, [page, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Changing the filter always jumps back to page 1 — staying on, say,
  // page 4 of a filtered-down list would usually just show an empty page.
  function handleFilterChange(nextFilter) {
    setActionFilter(nextFilter);
    setPage(1);
  }

  const rows = logs.map((log) => ({
    id: log.id,
    action: <StatusBadge status={log.action} />,
    path: log.path || "—",
    location: formatLocation(log.city, log.country),
    ipAddress: log.ipAddress || "—",
    details: log.details || "—",
    createdAt: DATE_FORMATTER.format(new Date(log.createdAt)),
  }));

  return (
    <section className="visitorLogsSection">
      <div className="visitorLogsHeaderRow">
        <span className="visitorLogsEyebrow">Traffic & Transactions</span>
        <h1 className="visitorLogsTitle">Visitor Logs</h1>
        <p className="visitorLogsSubtitle">
          Every page view and notable transaction from the visitor site — IP address, best-effort
          location, and what they did — newest first. Location is only looked up for transactions
          (like bookings), not routine page views.
        </p>
      </div>

      <div className="visitorLogsFilterRow">
        {ACTION_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`visitorLogsFilterPill${actionFilter === filter.value ? " visitorLogsFilterPillActive" : ""}`}
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
        emptyMessage="No visitor activity recorded yet."
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={25}
        onPageChange={setPage}
      />
    </section>
  );
}
