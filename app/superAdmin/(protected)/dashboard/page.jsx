/**
 * FILE: app/superAdmin/(protected)/dashboard/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Main landing view after login. Shows a 4-column KPI stat row
 * summarizing system-wide numbers at a glance, per the Super-Admin
 * Control Center design system (dashboard header + stat cards).
 *
 * Design pass: the AI Insight, Weather, and Marketing Insights widgets
 * used to stack as three separate full-width cards below the KPI row,
 * with the Maintenance toggle wedged between them — one long scroll.
 * They're now grouped into DashboardInsightsPanel (a tabbed panel —
 * one widget visible at a time) sitting beside DashboardSystemRail
 * (Maintenance toggle + Quick Links), so the page reads as KPIs on
 * top and two calm columns below, instead of five stacked sections.
 *
 * DATA FLOW:
 * 1. Rendered inside app/superAdmin/layout.jsx after Sidebar + AdminHeader
 * 2. KPI numbers are live — DashboardStatsClient fetches
 *    GET /api/admin/dashboard-stats via useDashboardStats() on mount
 * 3. DashboardInsightsPanel mounts all three insight widgets at once
 *    (AI Insight, Weather, Marketing) so their existing fetch-on-mount
 *    hooks are untouched — only which one is visible changes. See
 *    DashboardInsightsPanel.jsx for the tab-switching detail.
 * 4. DashboardSystemRail renders the unchanged MaintenanceToggleClient
 *    plus a static Quick Links card. See DashboardSystemRail.jsx.
 * 5. No interaction beyond viewing/tabbing/toggling — this page has no
 *    server mutations of its own; each widget owns its own actions.
 */
import "./Dashboard.css";
import DashboardStatsClient from "./DashboardStatsClient";
import DashboardInsightsPanel from "./DashboardInsightsPanel";
import DashboardSystemRail from "./DashboardSystemRail";

export default function DashboardPage() {
  return (
    <section className="dashboardSection">
      <div className="dashboardHeaderRow">
        <span className="dashboardEyebrow">System Status</span>
        <h1 className="dashboardTitle">Dashboard</h1>
      </div>

      {/* KPI stat card grid — 4 columns desktop, reflows down on smaller screens */}
      <DashboardStatsClient />

      {/* Two-column body: tabbed insights (left, wider) beside the quiet
          system rail (right) — replaces the old 5-section vertical stack */}
      <div className="dashboardMainGrid">
        <DashboardInsightsPanel />
        <DashboardSystemRail />
      </div>
    </section>
  );
}
