/**
 * FILE: app/superAdmin/(protected)/reports/ReportsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Date-range-scoped, exportable business report — revenue, occupancy,
 * and booking breakdowns for whatever period the admin picks (defaults
 * to the current calendar month). This is the exportable counterpart
 * to the live Analytics dashboard's rolling 30-day trend cards: pick a
 * specific period, see the numbers for exactly that period, and
 * download them as a CSV to hand to an owner or accountant.
 *
 * DATA FLOW:
 * 1. On mount (and whenever the date range changes), fetches
 *    GET /api/admin/reports?startDate=...&endDate=...
 * 2. Renders loading skeleton -> data, or a user-friendly error state
 *    with retry, per Rule 25
 * 3. "Export CSV" builds the CSV client-side from the already-fetched
 *    report data — no extra server round trip needed
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
} from "recharts";
import DataTable from "@/components/superAdmin/DataTable";
import "./Reports.css";

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const CHART_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const BOOKING_TYPE_LABELS = {
  overnight: "Overnight",
  day_tour: "Day Tour",
  night_tour: "Night Tour",
};

/** Default range: the current calendar month, as yyyy-mm-dd for <input type="date">. */
function getDefaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

/**
 * downloadReportCsv
 * Builds a CSV from the already-fetched report and triggers a browser
 * download — no server round trip, since the report data is already
 * on the client.
 */
function downloadReportCsv(report) {
  const lines = [
    `Report period,${report.startDate} to ${report.endDate}`,
    "",
    "Summary",
    `Total Revenue,${report.totalRevenue}`,
    `Confirmed Bookings,${report.confirmedBookingCount}`,
    `Cancelled Bookings,${report.cancelledBookingCount}`,
    `Occupancy Rate,${report.occupancyRate}%`,
    "",
    "Revenue by Room",
    "Room,Bookings,Revenue",
    ...report.bookingsByRoom.map((r) => `${r.roomName},${r.bookingCount},${r.revenue}`),
    "",
    "Bookings by Type",
    "Type,Count",
    ...report.bookingsByType.map((t) => `${BOOKING_TYPE_LABELS[t.bookingType] ?? t.bookingType},${t.count}`),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `report-${report.startDate}-to-${report.endDate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * ReportStat
 * Single number for the chosen report period — deliberately simpler
 * than the dashboard's StatCard, which always appends "vs last month";
 * that comparison doesn't make sense for an arbitrary admin-picked
 * date range, so this just shows the label and the value.
 */
function ReportStat({ label, value }) {
  return (
    <div className="reportStatCard">
      <span className="reportStatLabel">{label}</span>
      <span className="reportStatValue">{value}</span>
    </div>
  );
}

export default function ReportsClient() {
  const [dateRange, setDateRange] = useState(getDefaultRange);
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams(dateRange);
      const response = await fetch(`/api/admin/reports?${params.toString()}`);
      const result = await response.json();

      if (!result.success) {
        setLoadError(result.message || "Failed to generate the report. Please try again.");
        return;
      }

      setReport(result.data);
    } catch {
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const roomColumns = [
    { key: "roomName", label: "Room", align: "left" },
    { key: "bookingCount", label: "Bookings", align: "right" },
    { key: "revenue", label: "Revenue", align: "right", mono: true },
  ];
  const roomRows =
    report?.bookingsByRoom.map((r, index) => ({
      id: String(index),
      roomName: r.roomName,
      bookingCount: r.bookingCount,
      revenue: CURRENCY_FORMATTER.format(r.revenue),
    })) ?? [];

  return (
    <section className="reportsSection">
      <div className="reportsHeaderRow">
        <div>
          <span className="reportsEyebrow">Insights</span>
          <h1 className="reportsTitle">Reports</h1>
          <p className="reportsSubtitle">
            Revenue, occupancy, and booking breakdowns for a specific period — pick a range and
            export it to hand off to an owner or accountant.
          </p>
        </div>
        <button
          type="button"
          className="reportsExportButton"
          onClick={() => report && downloadReportCsv(report)}
          disabled={!report || isLoading}
        >
          Export CSV
        </button>
      </div>

      <div className="reportsDateRangeRow">
        <label className="reportsDateField">
          <span>Start date</span>
          <input
            type="date"
            value={dateRange.startDate}
            max={dateRange.endDate}
            onChange={(e) => setDateRange((prev) => ({ ...prev, startDate: e.target.value }))}
          />
        </label>
        <label className="reportsDateField">
          <span>End date</span>
          <input
            type="date"
            value={dateRange.endDate}
            min={dateRange.startDate}
            onChange={(e) => setDateRange((prev) => ({ ...prev, endDate: e.target.value }))}
          />
        </label>
      </div>

      {isLoading && (
        <div className="reportsGrid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="reportsSkeletonCard" />
          ))}
        </div>
      )}

      {!isLoading && loadError && (
        <div className="reportsErrorState">
          <p>{loadError}</p>
          <button type="button" className="reportsRetryButton" onClick={fetchReport}>
            Try again
          </button>
        </div>
      )}

      {!isLoading && !loadError && report && (
        <>
          <div className="reportsGrid">
            <ReportStat label="Total Revenue" value={CURRENCY_FORMATTER.format(report.totalRevenue)} />
            <ReportStat label="Confirmed Bookings" value={report.confirmedBookingCount} />
            <ReportStat label="Cancelled Bookings" value={report.cancelledBookingCount} />
            <ReportStat label="Occupancy Rate" value={`${report.occupancyRate}%`} />
          </div>

          <div className="reportsChartCard">
            <h2 className="reportsSectionTitle">Revenue by Day</h2>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={report.dailyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => CHART_DATE_FORMATTER.format(new Date(value))}
                  stroke="var(--color-text-muted)"
                  fontSize={11}
                />
                <YAxis stroke="var(--color-text-muted)" fontSize={11} />
                <Tooltip
                  labelFormatter={(value) => CHART_DATE_FORMATTER.format(new Date(value))}
                  formatter={(value) => CURRENCY_FORMATTER.format(value)}
                />
                <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="reportsTableCard">
            <h2 className="reportsSectionTitle">Revenue by Room</h2>
            <DataTable columns={roomColumns} rows={roomRows} emptyMessage="No confirmed bookings in this period." />
          </div>
        </>
      )}
    </section>
  );
}
