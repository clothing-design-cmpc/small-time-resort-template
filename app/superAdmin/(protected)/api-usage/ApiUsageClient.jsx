/**
 * FILE: app/superAdmin/(protected)/api-usage/ApiUsageClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Shows how many calls this app has made to each metered third-party
 * API it depends on (Google Weather, Google Maps, Gemini, GitHub,
 * EmailJS, Google Drive, Cloudflare R2, Supabase), broken down by
 * today / last 7 days / last 30 days, plus a direct link to that
 * provider's own dashboard — the only place the real, authoritative
 * quota-consumed number lives. This page can only ever show what this
 * app itself called; it can never see quota used before logging
 * started, or by another project sharing the same key.
 *
 * DATA FLOW:
 * 1. On mount, fetches GET /api/admin/api-usage
 * 2. Renders one card per API_CATALOG entry, seeded even at zero calls
 *    so a brand-new project still shows the full list of dependencies
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import "./ApiUsage.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * ApiUsageCard
 * One card per third-party API — call counters plus a direct link to
 * that provider's own usage dashboard, since this app's own count can
 * never be the authoritative quota number (see file header).
 */
function ApiUsageCard({ service }) {
  return (
    <article className="apiUsageCard">
      <div className="apiUsageCardHeader">
        <h3 className="apiUsageCardLabel">{service.label}</h3>
        <a
          href={service.dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="apiUsageDashboardLink"
        >
          Open dashboard ↗
        </a>
      </div>

      <p className="apiUsageQuotaNote">{service.quotaNote}</p>

      <div className="apiUsageCounters">
        <div className="apiUsageCounter">
          <span className="apiUsageCounterValue">{service.todayCount}</span>
          <span className="apiUsageCounterLabel">Today</span>
        </div>
        <div className="apiUsageCounter">
          <span className="apiUsageCounterValue">{service.last7DaysCount}</span>
          <span className="apiUsageCounterLabel">Last 7 days</span>
        </div>
        <div className="apiUsageCounter">
          <span className="apiUsageCounterValue">{service.last30DaysCount}</span>
          <span className="apiUsageCounterLabel">Last 30 days</span>
        </div>
        {/* Failed-call count only shows when there's at least one — a
            clean row of zeros never needs to draw attention to itself. */}
        {service.failedCount > 0 && (
          <div className="apiUsageCounter apiUsageCounter--failed">
            <span className="apiUsageCounterValue">{service.failedCount}</span>
            <span className="apiUsageCounterLabel">Failed (30d)</span>
          </div>
        )}
      </div>

      <p className="apiUsageFooterRow">
        <span className="apiUsageUsedBy">{service.usedBy}</span>
        <span className="apiUsageLastCall">
          {service.lastCallAt
            ? `Last call: ${DATE_FORMATTER.format(new Date(service.lastCallAt))}`
            : "No calls logged yet"}
        </span>
      </p>
    </article>
  );
}

/** Skeleton placeholder shown while the initial fetch is in flight. */
function ApiUsageSkeletonGrid() {
  return (
    <div className="apiUsageGrid">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="apiUsageCard apiUsageCard--skeleton">
          <div className="apiUsageSkeletonBlock" style={{ width: "60%", height: "1.1rem" }} />
          <div className="apiUsageSkeletonBlock" style={{ width: "90%", height: "0.8rem" }} />
          <div className="apiUsageSkeletonBlock" style={{ width: "100%", height: "3rem" }} />
        </div>
      ))}
    </div>
  );
}

export default function ApiUsageClient() {
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchApiUsage = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/admin/api-usage");
      const result = await response.json();

      if (!result.success) {
        setLoadError(result.message || "Failed to load API usage. Please try again.");
        return;
      }

      setServices(result.data.services);
    } catch {
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApiUsage();
  }, [fetchApiUsage]);

  return (
    <section className="apiUsageSection">
      <div className="apiUsageHeaderRow">
        <span className="apiUsageEyebrow">Insights</span>
        <h1 className="apiUsageTitle">API Usage</h1>
        <p className="apiUsageSubtitle">
          Call counts this app has logged for each third-party API it depends on. These numbers
          only count calls made from this project — for the real, authoritative quota remaining
          on each account, open that provider's own dashboard using the link on each card.
        </p>
      </div>

      {isLoading && <ApiUsageSkeletonGrid />}

      {!isLoading && loadError && (
        <div className="apiUsageErrorState">
          <p>{loadError}</p>
          <button type="button" className="apiUsageRetryButton" onClick={fetchApiUsage}>
            Try again
          </button>
        </div>
      )}

      {!isLoading && !loadError && (
        <div className="apiUsageGrid">
          {services.map((service) => (
            <ApiUsageCard key={service.service} service={service} />
          ))}
        </div>
      )}
    </section>
  );
}
