/**
 * FILE: app/superAdmin/(protected)/analytics/AnalyticsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Displays Rule 41 aggregate traffic analytics (Daily Views trend, Top
 * Pages, Top Traffic Sources, Device Breakdown, a specific city-level
 * Location breakdown, and a 30-day activity Heatmap) alongside five
 * Booking-sourced sales metrics — Total Revenue, Lost Revenue,
 * Rebookings, Cancelled Bookings, and Conversion Rate. Each sales
 * metric is laid out as a single row: its headline card on the left,
 * its own 30-day trend chart on the right — so an admin reads the
 * number and its trend together instead of hunting across the page
 * for a matching chart.
 *
 * CHARTING:
 * Charts are rendered with Recharts (area/bar/pie) and a Nivo Calendar
 * heatmap — swapped in for the old hand-rolled SVG/CSS charts so the
 * page reads as a polished dashboard instead of custom-drawn shapes.
 * All chart colors reference the page's existing CSS custom
 * properties so the charts stay in lockstep with the rest of the
 * design system (Rule 33) with no separate color palette to maintain.
 *
 * DATA FLOW:
 * 1. On mount, fetches GET /api/admin/analytics
 * 2. Renders loading skeleton -> data, or a user-friendly error state
 *    with retry, per Rule 25
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { ResponsiveCalendar } from "@nivo/calendar";
import "./Analytics.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const PESO_FORMATTER = (value) => `₱${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

// Single accent-green palette (varying shade per rank) — matches Rule
// 17.2 ("no rainbow/multicolor, one accent family only").
const CHART_PALETTE = ["#22c55e", "#4ade80", "#86efac", "#166534", "#0f766e", "#64748b"];

/**
 * ChartTooltip
 * Shared Recharts tooltip content — styled to match the page's dark
 * card chrome instead of Recharts' default white box.
 */
function ChartTooltip({ active, payload, label, formatValue = (v) => v.toLocaleString() }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="analyticsChartTooltip">
      {label && <span className="analyticsChartTooltipLabel">{label}</span>}
      <span className="analyticsChartTooltipValue">{formatValue(payload[0].value)}</span>
    </div>
  );
}

/**
 * MetricTrendChart
 * The small right-hand-side chart paired with each headline metric
 * card (Rule: chart always sits beside its card, on the right). A
 * compact Recharts area sparkline — no axes, just the shape of the
 * last 30 days with a tooltip for the exact value on hover.
 */
function MetricTrendChart({ series, formatValue = (v) => v.toLocaleString() }) {
  return (
    <div className="analyticsMetricChartPanel">
      <ResponsiveContainer width="100%" height="100%" minHeight={64}>
        <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="metricSparklineFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <Tooltip
            content={<ChartTooltip formatValue={formatValue} />}
            labelFormatter={(date) => DATE_FORMATTER.format(new Date(date))}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-accent)"
            strokeWidth={2}
            fill="url(#metricSparklineFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * HorizontalBarChart
 * Shared Recharts horizontal bar chart for Top Pages, Top Traffic
 * Sources, and Top Locations — replaces the old plain CSS bar-list
 * rows with a proper chart (gridlines, aligned bars, hover tooltip).
 */
function HorizontalBarChart({ rows, labelKey, formatValue = (v) => v.toLocaleString() }) {
  // Recharts draws vertical-layout bar charts top-to-bottom in array
  // order — reverse so the highest value still renders at the top,
  // matching how the old bar list read (biggest first, top to bottom).
  const chartData = [...rows].reverse();
  const rowHeight = 34;

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * rowHeight)}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--color-border)" />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey={labelKey}
          width={140}
          tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <Tooltip
          cursor={{ fill: "var(--color-surface-hover)" }}
          content={<ChartTooltip formatValue={formatValue} />}
        />
        <Bar dataKey="views" fill="var(--color-accent)" radius={[0, 4, 4, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
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

  /**
   * buildDonutLegend
   * Turns a [{ label, views }] list into legend rows with a percent
   * and an assigned palette color — feeds both the Recharts Pie
   * (colors) and the legend list beside it (labels + percentages).
   */
  function buildDonutLegend(rows, labelKey) {
    const total = rows.reduce((sum, row) => sum + row.views, 0);
    return rows.map((row, index) => ({
      label: row[labelKey],
      views: row.views,
      percent: total === 0 ? 0 : (row.views / total) * 100,
      color: CHART_PALETTE[index % CHART_PALETTE.length],
    }));
  }

  const deviceLegend = data ? buildDonutLegend(data.deviceBreakdown, "deviceType") : null;
  const deviceTotal = deviceLegend ? deviceLegend.reduce((sum, row) => sum + row.views, 0) : 0;

  // Nivo Calendar expects [{ day: "YYYY-MM-DD", value }] and an
  // explicit from/to date range covering every point.
  const heatmapData = data ? data.dailyTotals.map((row) => ({ day: row.date, value: row.views })) : null;
  const heatmapFrom = data?.dailyTotals[0]?.date;
  const heatmapTo = data?.dailyTotals[data.dailyTotals.length - 1]?.date;

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

          {/* --- Daily Views — Recharts smooth filled-area chart --- */}
          <div className="analyticsPanel">
            <h2 className="analyticsPanelTitle">Daily Views</h2>
            {data.dailyTotals.length < 2 ? (
              <p className="analyticsEmptyMessage">No views recorded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.dailyTotals} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="dailyViewsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--color-border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) => DATE_FORMATTER.format(new Date(date))}
                    tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--color-border)" }}
                    minTickGap={32}
                  />
                  <YAxis
                    tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    labelFormatter={(date) => DATE_FORMATTER.format(new Date(date))}
                  />
                  <Area
                    type="monotone"
                    dataKey="views"
                    stroke="var(--color-accent)"
                    strokeWidth={2.5}
                    fill="url(#dailyViewsFill)"
                    activeDot={{ r: 4, fill: "var(--color-accent)" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* --- Traffic Heatmap — Nivo calendar of daily views over the window --- */}
          <div className="analyticsPanel">
            <h2 className="analyticsPanelTitle">Traffic Heatmap</h2>
            {!heatmapData || heatmapData.length < 2 ? (
              <p className="analyticsEmptyMessage">No views recorded yet.</p>
            ) : (
              <div className="analyticsHeatmapWrap">
                <ResponsiveCalendar
                  data={heatmapData}
                  from={heatmapFrom}
                  to={heatmapTo}
                  emptyColor="var(--color-surface-hover)"
                  colors={["#14532d", "#166534", "#22c55e", "#4ade80", "#86efac"]}
                  margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  yearSpacing={0}
                  monthBorderColor="var(--color-bg)"
                  dayBorderWidth={2}
                  dayBorderColor="var(--color-bg)"
                  theme={{
                    text: { fill: "var(--color-text-muted)", fontSize: 11 },
                    tooltip: {
                      container: {
                        background: "var(--color-surface)",
                        color: "var(--color-text-primary)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                      },
                    },
                  }}
                />
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
                <HorizontalBarChart rows={data.topPages} labelKey="path" />
              )}
            </div>

            {/* Top traffic sources */}
            <div className="analyticsPanel">
              <h2 className="analyticsPanelTitle">Top Traffic Sources</h2>
              {data.topReferrers.length === 0 ? (
                <p className="analyticsEmptyMessage">No referrer data yet.</p>
              ) : (
                <HorizontalBarChart rows={data.topReferrers} labelKey="referrerHost" />
              )}
            </div>

            {/* Device breakdown — Recharts donut chart */}
            <div className="analyticsPanel">
              <h2 className="analyticsPanelTitle">Device Breakdown</h2>
              {data.deviceBreakdown.length === 0 ? (
                <p className="analyticsEmptyMessage">No device data yet.</p>
              ) : (
                <div className="analyticsDonutWrap">
                  <div className="analyticsDonutChartWrap">
                    <ResponsiveContainer width={140} height={140}>
                      <PieChart>
                        <Pie
                          data={deviceLegend}
                          dataKey="views"
                          nameKey="label"
                          innerRadius={45}
                          outerRadius={68}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {deviceLegend.map((segment) => (
                            <Cell key={segment.label} fill={segment.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="analyticsDonutCenter">
                      <span className="analyticsDonutCenterValue">{deviceTotal.toLocaleString()}</span>
                      <span className="analyticsDonutCenterLabel">views</span>
                    </div>
                  </div>
                  <ul className="analyticsDonutLegend">
                    {deviceLegend.map((segment) => (
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

            {/* Location breakdown — specific city + country, sorted, fast to scan */}
            <div className="analyticsPanel">
              <h2 className="analyticsPanelTitle">Top Locations</h2>
              {data.locationBreakdown.length === 0 ? (
                <p className="analyticsEmptyMessage">No location data yet.</p>
              ) : (
                <HorizontalBarChart
                  rows={data.locationBreakdown.map((row) => ({
                    ...row,
                    locationLabel: `${row.city}${row.countryCode && row.countryCode !== "Unknown" ? `, ${row.countryCode}` : ""}`,
                  }))}
                  labelKey="locationLabel"
                />
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
