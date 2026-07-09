/**
 * FILE: app/superAdmin/(protected)/analytics/AnalyticsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Displays Rule 41 aggregate traffic analytics: total views (last 30
 * days), a daily trend bar chart, top pages, top traffic sources, and
 * device/country breakdowns. Every number here is a pre-aggregated
 * counter from PageViewDaily — there is no per-visitor data behind any
 * of these views, by design (see services/analytics.js).
 *
 * DATA FLOW:
 * 1. On mount, fetches GET /api/admin/analytics
 * 2. Renders loading skeleton -> data, or a user-friendly error state
 *    with retry, per Rule 25
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import "./Analytics.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export default function AnalyticsClient() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/admin/analytics");
      const result = await response.json();

      if (!result.success) {
        setLoadError(result.message || "Failed to load analytics. Please try again.");
        return;
      }

      setData(result.data);
    } catch {
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Highest single-day view count, used to scale the daily trend bars proportionally.
  const maxDailyViews = data ? Math.max(1, ...data.dailyTotals.map((day) => day.views)) : 1;
  const maxTopPageViews = data ? Math.max(1, ...data.topPages.map((row) => row.views)) : 1;

  return (
    <section className="analyticsSection">
      <div className="analyticsHeaderRow">
        <span className="analyticsEyebrow">Traffic Overview</span>
        <h1 className="analyticsTitle">Analytics</h1>
        <p className="analyticsSubtitle">
          Aggregate visitor traffic — page views, sources, and device/country trends over the last 30 days.
          This data is anonymized: no individual visitor is ever tracked or identifiable here.
        </p>
      </div>

      {isLoading && <div className="analyticsSkeleton" aria-hidden="true" />}

      {!isLoading && loadError && (
        <div className="analyticsErrorState">
          <p>{loadError}</p>
          <button type="button" onClick={fetchAnalytics} className="analyticsRetryButton">
            Try again
          </button>
        </div>
      )}

      {!isLoading && !loadError && data && (
        <>
          <div className="analyticsTotalCard">
            <span className="analyticsTotalLabel">Total Page Views (Last 30 Days)</span>
            <span className="analyticsTotalValue">{data.totalViews.toLocaleString()}</span>
          </div>

          {/* Daily trend — simple CSS bar chart, no data-viz dependency needed */}
          <div className="analyticsPanel">
            <h2 className="analyticsPanelTitle">Daily Views</h2>
            {data.dailyTotals.length === 0 ? (
              <p className="analyticsEmptyMessage">No views recorded yet.</p>
            ) : (
              <div className="analyticsBarChart">
                {data.dailyTotals.map((day) => (
                  <div key={day.date} className="analyticsBarColumn">
                    <div
                      className="analyticsBar"
                      style={{ height: `${(day.views / maxDailyViews) * 100}%` }}
                      title={`${day.views} views`}
                    />
                    <span className="analyticsBarLabel">{DATE_FORMATTER.format(new Date(day.date))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="analyticsPanelGrid">
            {/* Top pages */}
            <div className="analyticsPanel">
              <h2 className="analyticsPanelTitle">Top Pages</h2>
              {data.topPages.length === 0 ? (
                <p className="analyticsEmptyMessage">No page views yet.</p>
              ) : (
                <ul className="analyticsBarList">
                  {data.topPages.map((row) => (
                    <li key={row.path} className="analyticsBarListRow">
                      <span className="analyticsBarListLabel">{row.path}</span>
                      <div className="analyticsBarListTrack">
                        <div
                          className="analyticsBarListFill"
                          style={{ width: `${(row.views / maxTopPageViews) * 100}%` }}
                        />
                      </div>
                      <span className="analyticsBarListValue">{row.views.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Top traffic sources */}
            <div className="analyticsPanel">
              <h2 className="analyticsPanelTitle">Top Traffic Sources</h2>
              {data.topReferrers.length === 0 ? (
                <p className="analyticsEmptyMessage">No referrer data yet.</p>
              ) : (
                <ul className="analyticsSimpleList">
                  {data.topReferrers.map((row) => (
                    <li key={row.referrerHost} className="analyticsSimpleListRow">
                      <span>{row.referrerHost}</span>
                      <span className="analyticsSimpleListValue">{row.views.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Device breakdown */}
            <div className="analyticsPanel">
              <h2 className="analyticsPanelTitle">Device Breakdown</h2>
              {data.deviceBreakdown.length === 0 ? (
                <p className="analyticsEmptyMessage">No device data yet.</p>
              ) : (
                <ul className="analyticsSimpleList">
                  {data.deviceBreakdown.map((row) => (
                    <li key={row.deviceType} className="analyticsSimpleListRow">
                      <span style={{ textTransform: "capitalize" }}>{row.deviceType}</span>
                      <span className="analyticsSimpleListValue">{row.views.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Country breakdown */}
            <div className="analyticsPanel">
              <h2 className="analyticsPanelTitle">Top Countries</h2>
              {data.countryBreakdown.length === 0 ? (
                <p className="analyticsEmptyMessage">No location data yet.</p>
              ) : (
                <ul className="analyticsSimpleList">
                  {data.countryBreakdown.map((row) => (
                    <li key={row.countryCode} className="analyticsSimpleListRow">
                      <span>{row.countryCode}</span>
                      <span className="analyticsSimpleListValue">{row.views.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
