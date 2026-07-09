/**
 * FILE: app/superAdmin/(protected)/account-activity/AccountActivityClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Rule 42's per-account navigation trail: what page each admin/staff
 * account visited, from where (city/country + IP), and when. Separate
 * from Security Logs (login/attack events, Rule 38) and Analytics
 * (anonymous aggregate traffic, Rule 41).
 *
 * DATA FLOW:
 * 1. On mount and whenever page changes, fetches
 *    GET /api/admin/account-activity?page={page}
 * 2. DataTable renders rows with its own loading/empty/error states
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/superAdmin/DataTable";
import "./AccountActivity.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const columns = [
  { key: "actorName", label: "Admin" },
  { key: "action", label: "Page / Action" },
  { key: "location", label: "Location" },
  { key: "ipAddress", label: "IP Address", mono: true },
  { key: "createdAt", label: "When", mono: true },
];

export default function AccountActivityClient() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(`/api/admin/account-activity?page=${page}`);
      const result = await response.json();

      if (!result.success) {
        setLoadError(result.message || "Failed to load account activity. Please try again.");
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
  }, [page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Formats each raw row into the shape DataTable expects, combining
  // city + country into one readable "Location" column.
  const rows = logs.map((log) => ({
    id: log.id,
    actorName: log.actorName,
    action: log.action,
    location: [log.geoCity, log.geoCountry].filter(Boolean).join(", ") || "Unknown",
    ipAddress: log.ipAddress ?? "—",
    createdAt: DATE_FORMATTER.format(new Date(log.createdAt)),
  }));

  return (
    <section className="accountActivitySection">
      <div className="accountActivityHeaderRow">
        <span className="accountActivityEyebrow">Staff Oversight</span>
        <h1 className="accountActivityTitle">Account Activity</h1>
        <p className="accountActivitySubtitle">
          Navigation trail for super-admin and staff accounts — which pages were visited, from where, and
          when. Scoped only to logged-in accounts, never anonymous site visitors.
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        error={loadError}
        emptyMessage="No account activity recorded yet."
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={25}
        onPageChange={setPage}
      />
    </section>
  );
}
