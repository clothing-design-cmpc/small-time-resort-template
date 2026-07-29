/**
 * FILE: app/superAdmin/(protected)/analytics/AnalyticsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Displays Rule 41 aggregate traffic analytics (Daily Views trend, Top
 * Pages, Top Traffic Sources, Device Breakdown, and a specific
 * city-level Location breakdown) alongside five Booking-sourced sales
 * metrics — Total Revenue, Lost Revenue, Rebookings, Cancelled
 * Bookings, and Conversion Rate. Each sales metric is laid out as a
 * single row: its headline card on the left, its own 30-day trend
 * chart on the right — so an admin reads the number and its trend
 * together instead of hunting across the page for a matching chart.
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
const PESO_FORMATTER = (value) => `₱${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/**
 * buildSmoothAreaPath
 * Turns a [{date, value}] series into an SVG line + filled-area path
 * using simple quadratic midpoint smoothing, so the Daily Views trend
 * reads as a clean curve instead of the old cramped vertical bars.
 * Returns null when there's fewer than 2 points (nothing to draw a
 * line between).
 */
function buildSmoothAreaPath(series, width, height, paddingY = 10) {
  if (!series || series.length < 2) return null;

  const maxValue = Math.max(1, ...series.map((point) => point.value));
  const stepX = width / (series.length - 1);
  const points = series.map((point, index) => ({
    x: index * stepX,
    y: height - paddingY - (point.value / maxValue) * (height - paddingY * 2),
  }));

  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const midX = (points[i - 1].x + points[i].x) / 2;
    linePath += ` Q ${points[i - 1].x} ${points[i - 1].y} ${midX} ${(points[i - 1].y + points[i].y) / 2}`;
    linePath += ` T ${points[i].x} ${points[i].y}`;
  }

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return { linePath, areaPath, points, maxValue };
}

/**
 * MetricTrendChart
 * The small right-hand-side chart paired with each headline metric
 * card (Rule: chart always sits beside its card, on the right). A
 * plain CSS bar sparkline — compact, no axis labels, just the shape
 * of the last 30 days with a tooltip per bar for the exact value.
 */
function MetricTrendChart({ series, formatValue = (v) => v.toLocaleString() }) {
  const maxValue = Math.max(1, ...series.map((point) => point.value));

  return (
    <div className="analyticsMetricChartPanel">
      <div className="analyticsMetricSparkline">
        {series.map((point) => (
          <div
            key={point.date}
            className="analyticsMetricSparkBar"
            style={{ height: `${Math.max(3, (point.value / maxValue) * 100)}%` }}
            title={`${DATE_FORMATTER.format(new Date(point.date))}: ${formatValue(point.value)}`}
          />
        ))}
      </div>
    </div>
  );
}

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

  const maxTopPageViews = data ? Math.max(1, ...data.topPages.map((row) => row.views)) : 1;
  const maxReferrerViews = data ? Math.max(1, ...data.topReferrers.map((row) => row.views)) : 1;
  const maxLocationViews = data ? Math.max(1, ...data.locationBreakdown.map((row) => row.views)) : 1;

  /**
   * buildDonutSegments
   * Turns a [{ label, views }] list into conic-gradient stops plus a
   * legend array. Uses a single monochrome accent-green palette
   * (varying shade per rank) instead of a rainbow — matches Rule 17.2
   * ("no rainbow/multicolor, one accent family only").
   */
  function buildDonutSegments(rows, labelKey) {
    const palette = ["#22c55e", "#4ade80", "#86efac", "#166534", "#0f766e", "#64748b"];
    const total = rows.reduce((sum, row) => sum + row.views, 0);
    let cumulativePercent = 0;

    const legend = rows.map((row, index) => {
      const percent = total === 0 ? 0 : (row.views / total) * 100;
      const color = palette[index % palette.length];
      const stopStart = cumulativePercent;
      cumulativePercent += percent;
      return { label: row[labelKey], views: row.views, percent, color, stopStart, stopEnd: cumulativePercent };
    });

    const gradientStops = legend
      .map((segment) => `${segment.color} ${segment.stopStart}% ${segment.stopEnd}%`)
      .join(", ");

    return { legend, gradientStops: total === 0 ? "var(--color-border) 0% 100%" : gradientStops, total };
  }

  const deviceDonut = data ? buildDonutSegments(data.deviceBreakdown, "deviceType") : null;

  // Redesigned Daily Views chart — smooth filled area instead of the
  // old cramped vertical bars.
  const dailyViewsChart = data
    ? buildSmoothAreaPath(
        data.dailyTotals.map((d) => ({ date: d.date, value: d.views })),
        600,
        160
      )
    : null;

  return (
    <section className="analyticsSection">
      <div className="analyticsHeaderRow">
        <span className="analyticsEyebrow">Traffic Overview</span>
        <h1 className="analyticsTitle">Analytics</h1>
        <p className="analyticsSubtitle">
          Aggregate visitor traffic and sales performance over the last 30 days. Traffic data is anonymized: no
          individual visitor is ever tracked or identifiable here.
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

          {/* --- Metric rows: card on the left, its own 30-day chart on the right --- */}

          <div className="analyticsMetricRow">
            <div className="analyticsMetricCard">
              <span className="analyticsSummaryLabel">Total Revenue</span>
              <span className="analyticsSummaryValue">{PESO_FORMATTER(data.salesSummary.totalRevenue)}</span>
              <span className="analyticsSummarySubtext">
                {data.salesSummary.bookingsCount.toLocaleString()} confirmed bookings · avg{" "}
                {PESO_FORMATTER(data.salesSummary.averageOrderValue)}
              </span>
            </div>
            <MetricTrendChart series={data.salesSummary.dailySeries} formatValue={PESO_FORMATTER} />
          </div>

          <div className="analyticsMetricRow">
            <div className="analyticsMetricCard">
              <span className="analyticsSummaryLabel">Lost Revenue</span>
              <span className="analyticsSummaryValue analyticsSummaryValueNegative">
                {PESO_FORMATTER(data.lostRevenueSummary.lostRevenue)}
              </span>
              <span className="analyticsSummarySubtext">
                {data.lostRevenueSummary.cancelBookingsCount.toLocaleString()} cancelled bookings
              </span>
            </div>
            <MetricTrendChart series={data.lostRevenueSummary.dailySeries} formatValue={PESO_FORMATTER} />
          </div>

          <div className="analyticsMetricRow">
            <div className="analyticsMetricCard">
              <span className="analyticsSummaryLabel">Rebookings</span>
              <span className="analyticsSummaryValue">{data.rebookingSummary.rebookingsCount.toLocaleString()}</span>
              <span className="analyticsSummarySubtext">
                from {data.rebookingSummary.repeatGuestCount.toLocaleString()} repeat guests
              </span>
            </div>
            <MetricTrendChart series={data.rebookingSummary.dailySeries} />
          </div>

          <div className="analyticsMetricRow">
            <div className="analyticsMetricCard">
              <span className="analyticsSummaryLabel">Cancelled Bookings</span>
              <span className="analyticsSummaryValue analyticsSummaryValueNegative">
                {data.cancelSummary.cancelBookingsCount.toLocaleString()}
              </span>
              <span className="analyticsSummarySubtext">last 30 days</span>
            </div>
            <MetricTrendChart series={data.cancelSummary.dailySeries} />
          </div>

          <div className="analyticsMetricRow">
            <div className="analyticsMetricCard">
              <span className="analyticsSummaryLabel">Conversion Rate</span>
              <span className="analyticsSummaryValue">{data.conversion.conversionRatePercent}%</span>
              <span className="analyticsSummarySubtext">
                {data.conversion.confirmedBookingCount.toLocaleString()} bookings from{" "}
                {data.conversion.totalViews.toLocaleString()} visits
              </span>
            </div>
            <MetricTrendChart series={data.conversion.dailySeries} formatValue={(v) => `${v}%`} />
          </div>

          {/* --- Daily Views — redesigned as a smooth filled-area chart --- */}
          <div className="analyticsPanel">
            <h2 className="analyticsPanelTitle">Daily Views</h2>
            {!dailyViewsChart ? (
              <p className="analyticsEmptyMessage">No views recorded yet.</p>
            ) : (
              <div className="analyticsTrendChartWrap">
                <svg
                  className="analyticsTrendChart"
                  viewBox="0 0 600 160"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Daily page views over the last 30 days"
                >
                  <defs>
                    <linearGradient id="dailyViewsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={dailyViewsChart.areaPath} fill="url(#dailyViewsFill)" stroke="none" />
                  <path d={dailyViewsChart.linePath} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" />
                  {dailyViewsChart.points.map((point, index) => (
                    <circle key={data.dailyTotals[index].date} cx={point.x} cy={point.y} r="3" fill="var(--color-accent)">
                      <title>
                        {DATE_FORMATTER.format(new Date(data.dailyTotals[index].date))}: {data.dailyTotals[index].views}{" "}
                        views
                      </title>
                    </circle>
                  ))}
                </svg>
                <div className="analyticsTrendChartAxis">
                  <span>{DATE_FORMATTER.format(new Date(data.dailyTotals[0].date))}</span>
                  <span>{DATE_FORMATTER.format(new Date(data.dailyTotals[data.dailyTotals.length - 1].date))}</span>
                </div>
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
                <ul className="analyticsBarList">
                  {data.topReferrers.map((row) => (
                    <li key={row.referrerHost} className="analyticsBarListRow">
                      <span className="analyticsBarListLabel">{row.referrerHost}</span>
                      <div className="analyticsBarListTrack">
                        <div
                          className="analyticsBarListFill"
                          style={{ width: `${(row.views / maxReferrerViews) * 100}%` }}
                        />
                      </div>
                      <span className="analyticsBarListValue">{row.views.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Device breakdown — donut chart */}
            <div className="analyticsPanel">
              <h2 className="analyticsPanelTitle">Device Breakdown</h2>
              {data.deviceBreakdown.length === 0 ? (
                <p className="analyticsEmptyMessage">No device data yet.</p>
              ) : (
                <div className="analyticsDonutWrap">
                  <div
                    className="analyticsDonut"
                    style={{ background: `conic-gradient(${deviceDonut.gradientStops})` }}
                  >
                    <div className="analyticsDonutCenter">
                      <span className="analyticsDonutCenterValue">{deviceDonut.total.toLocaleString()}</span>
                      <span className="analyticsDonutCenterLabel">views</span>
                    </div>
                  </div>
                  <ul className="analyticsDonutLegend">
                    {deviceDonut.legend.map((segment) => (
                      <li key={segment.label} className="analyticsDonutLegendRow">
                        <span className="analyticsDonutSwatch" style={{ backgroundColor: segment.color }} />
                        <span className="analyticsDonutLegendLabel" style={{ textTransform: "capitalize" }}>
                          {segment.label}
                        </span>
                        <span className="analyticsDonutLegendValue">{segment.percent.toFixed(0)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Location breakdown — specific city + country list, sorted, fast to scan */}
            <div className="analyticsPanel">
              <h2 className="analyticsPanelTitle">Top Locations</h2>
              {data.locationBreakdown.length === 0 ? (
                <p className="analyticsEmptyMessage">No location data yet.</p>
              ) : (
                <ul className="analyticsBarList">
                  {data.locationBreakdown.map((row) => (
                    <li key={`${row.city}-${row.countryCode}`} className="analyticsBarListRow">
                      <span className="analyticsBarListLabel">
                        {row.city}
                        {row.countryCode && row.countryCode !== "Unknown" ? `, ${row.countryCode}` : ""}
                      </span>
                      <div className="analyticsBarListTrack">
                        <div
                          className="analyticsBarListFill"
                          style={{ width: `${(row.views / maxLocationViews) * 100}%` }}
                        />
                      </div>
                      <span className="analyticsBarListValue">{row.views.toLocaleString()}</span>
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
