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
 * 2. STAT_CARDS below is static placeholder data — replace with a
 *    useDashboardStats() hook (src/hooks) once Supabase is connected
 * 3. No interaction beyond viewing — this page is read-only
 */
import "./Dashboard.css";
import StatCard from "@/components/superAdmin/StatCard";
import MaintenanceToggleClient from "./MaintenanceToggleClient";

/* Placeholder KPI data — replace with live Supabase counts once wired */
const STAT_CARDS = [
  { id: "totalGuests", label: "Total Guests", value: "1,250", trend: "5.2%", trendDirection: "up" },
  { id: "activeBookings", label: "Active Bookings", value: "38", trend: "2.1%", trendDirection: "up" },
  { id: "monthlyRevenue", label: "Monthly Revenue", value: "₱482,000", trend: "8.4%", trendDirection: "up" },
  { id: "openTickets", label: "Open Support Tickets", value: "4", trend: "1.0%", trendDirection: "down" },
];

export default function DashboardPage() {
  return (
    <section className="dashboardSection">
      <div className="dashboardHeaderRow">
        <span className="dashboardEyebrow">System Status</span>
        <h1 className="dashboardTitle">Dashboard</h1>
      </div>

      {/* KPI stat card grid — 4 columns desktop, reflows down on smaller screens */}
      <div className="dashboardGrid">
        {STAT_CARDS.map((stat) => (
          <StatCard key={stat.id} {...stat} />
        ))}
      </div>

      {/* Task 4 breach response — site-wide maintenance banner toggle */}
      <MaintenanceToggleClient />
    </section>
  );
}
