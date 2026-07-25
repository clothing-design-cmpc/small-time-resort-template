/**
 * FILE: app/superAdmin/(protected)/activity-feed/ActivityFeedClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the merged Activity Feed: a source filter (All / Visitors /
 * Staff), then a DataTable of interleaved VisitorLog + AccountActivityLog
 * rows, newest first. Each row is tagged with a small "Visitor"/"Staff"
 * pill so it's always clear who actually did what, even in the
 * combined view.
 *
 * DATA FLOW:
 * 1. On mount and whenever page/source filter changes, fetches
 *    GET /api/admin/activity-feed?page={page}&filter={filter}
 * 2. DataTable renders the rows with its own built-in loading/empty/
 *    error states and pagination footer
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/superAdmin/DataTable";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import "./ActivityFeed.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const SOURCE_FILTERS = [
  { value: "all", label: "All activity" },
  { value: "visitor", label: "Visitors only" },
  { value: "staff", label: "Staff only" },
];

const columns = [
  { key: "source", label: "Source", align: "center" },
  { key: "actorLabel", label: "Who" },
  { key: "action", label: "Action / Page" },
  { key: "location", label: "Location" },
  { key: "ipAddress", label: "IP Address", mono: true },
  { key: "createdAt", label: "When", mono: true },
];

/**
 * SourceTag
 * Small pill distinguishing an anonymous visitor row from a logged-in
 * staff row — the one thing that must never get lost when the two
 * sources are shown together.
 */
function SourceTag({ source }) {
  return (
    <span className={`activityFeedSourceTag activityFeedSourceTag--${source}`}>
      {source === "staff" ? "Staff" : "Visitor"}
    </span>
  );
}

export default function ActivityFeedClient() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  // Set once when the API reports a fresh archive event, stays visible
  // as a dismissible banner until the admin closes it — never
  // re-triggered by simply changing pages or filters afterward.
  const [archiveNotice, setArchiveNotice] = useState(null);
  const { toasts, showToast, dismissToast } = useToast();

  const fetchFeed = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(`/api/admin/activity-feed?page=${page}&filter=${sourceFilter}`);
      const result = await response.json();

      if (!result.success) {
        setLoadError(result.message || "Failed to load the activity feed. Please try again.");
        return;
      }

      setLogs(result.data.logs);
      setTotalPages(result.data.totalPages);
      setTotalCount(result.data.totalCount);

      // A non-null archiveNotice means this exact response is the one
      // where the 100-page threshold just fired — show the banner and
      // toast now, once, then let the admin dismiss the banner.
      if (result.data.archiveNotice) {
        setArchiveNotice(result.data.archiveNotice);
        showToast(
          `✓ ${result.data.archiveNotice.recordCount} records archived to Cloudflare R2.`,
          "success"
        );
      }
    } catch {
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [page, sourceFilter, showToast]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Changing the filter always jumps back to page 1 — staying on a
  // later page after narrowing the source would usually show nothing.
  function handleFilterChange(nextFilter) {
    setSourceFilter(nextFilter);
    setPage(1);
  }

  const rows = logs.map((log) => ({
    id: log.id,
    source: <SourceTag source={log.source} />,
    actorLabel: log.actorLabel,
    action: log.action,
    location: log.location,
    ipAddress: log.ipAddress,
    createdAt: DATE_FORMATTER.format(new Date(log.createdAt)),
  }));

  return (
    <section className="activityFeedSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="activityFeedHeaderRow">
        <span className="activityFeedEyebrow">Staff Oversight</span>
        <h1 className="activityFeedTitle">Activity Feed</h1>
        <p className="activityFeedSubtitle">
          Everything that happened on the site, newest first — anonymous visitor traffic and logged-in
          staff actions together. VisitorLog and AccountActivityLog stay separate tables underneath;
          this view just interleaves them by time. Use the filter to focus on one source, or open
          Visitor Logs / Account Activity directly for the full detail on either.
        </p>
      </div>

      {archiveNotice && (
        <div className="activityFeedArchiveBanner" role="status">
          <div className="activityFeedArchiveBannerText">
            <strong>Activity feed reached 100 pages.</strong> {archiveNotice.recordCount} records
            were exported to <strong>{archiveNotice.fileName}</strong> and cleared from this table.
          </div>
          <div className="activityFeedArchiveBannerActions">
            <a
              href={archiveNotice.r2SignedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="activityFeedArchiveBannerButton"
            >
              Download Archive
            </a>
            <button
              type="button"
              className="activityFeedArchiveBannerDismiss"
              onClick={() => setArchiveNotice(null)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="activityFeedFilterRow">
        {SOURCE_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`activityFeedFilterPill${sourceFilter === filter.value ? " activityFeedFilterPillActive" : ""}`}
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
        emptyMessage="No activity recorded yet."
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={10}
        onPageChange={setPage}
      />
    </section>
  );
}
