/**
 * FILE: app/superAdmin/(protected)/dashboard/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Main landing view after login. Shows a 4-column KPI stat row
 * summarizing system-wide numbers at a glance, per the Super-Admin
 * Control Center design system (dashboard header + stat cards).
 *
 * DATA FLOW:
 * 1. Rendered inside app/superAdmin/layout.jsx after Sidebar + AdminHeader
 * 2. KPI numbers are live — DashboardStatsClient fetches
 *    GET /api/admin/dashboard-stats via useDashboardStats() on mount
 * 3. Marketing Insights (Recent Bookings, Top Performing Rooms, Repeat
 *    Guest Rate) — MarketingInsightsClient fetches
 *    GET /api/admin/marketing-insights via useMarketingInsights() on mount
 * 4. No interaction beyond viewing — this page is read-only
 */
import "./Dashboard.css";
import DashboardStatsClient from "./DashboardStatsClient";
import MaintenanceToggleClient from "./MaintenanceToggleClient";
import MarketingInsightsClient from "./MarketingInsightsClient";
import AiInsightWidgetClient from "./AiInsightWidgetClient";
import WeatherCacheWidgetClient from "./WeatherCacheWidgetClient";

export default function DashboardPage() {
  return (
    <section className="dashboardSection">
      <div className="dashboardHeaderRow">
        <span className="dashboardEyebrow">System Status</span>
        <h1 className="dashboardTitle">Dashboard</h1>
      </div>

      {/* KPI stat card grid — 4 columns desktop, reflows down on smaller screens */}
      <DashboardStatsClient />

      {/* AI Sales Insight — daily automatic (6:00 AM) + manual "Regenerate now" */}
      <AiInsightWidgetClient />

      {/* Weather Forecast Cache — 3x/day automatic (5AM/12PM/8PM) + manual "Refresh now" */}
      <WeatherCacheWidgetClient />

      {/* Task 4 breach response — site-wide maintenance banner toggle */}
      <MaintenanceToggleClient />

      {/* Marketing Insights — Recent Bookings, Top Performing Rooms, Repeat Guest Rate */}
      <MarketingInsightsClient />
    </section>
  );
}
