/**
 * FILE: app/superAdmin/(protected)/dashboard/DashboardSystemRail.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Narrow side column next to DashboardInsightsPanel holding the
 * site-wide Maintenance toggle (unchanged logic, MaintenanceToggleClient)
 * plus a Quick Links card to frequently-needed pages that used to
 * require expanding the sidebar's Security/Insights groups. Keeps
 * system-level chrome out of the dashboard's primary reading column
 * (KPIs -> Insights tabs) instead of stacking it inline below.
 *
 * DATA FLOW:
 * 1. Purely presentational except for MaintenanceToggleClient, which
 *    keeps its own existing data flow (useMaintenanceMode or
 *    equivalent) untouched — this file only changes where it's
 *    rendered, not what it does.
 * 2. Quick Links are static <Link> entries to the four pages an
 *    admin checks most often outside their daily Overview/Content
 *    work — never fetched, never dynamic.
 */
"use client";

import Link from "next/link";
import MaintenanceToggleClient from "./MaintenanceToggleClient";

const QUICK_LINKS = [
  { label: "Security Logs", href: "/superAdmin/security-logs" },
  { label: "Backups", href: "/superAdmin/backups" },
  { label: "Audit Logs", href: "/superAdmin/audit-logs" },
  { label: "Reports", href: "/superAdmin/reports" },
];

export default function DashboardSystemRail() {
  return (
    <aside className="dashboardSystemRail">
      <MaintenanceToggleClient />

      <div className="dashboardRailCard">
        <span className="dashboardRailCardTitle">Quick Links</span>
        <div className="dashboardQuickLinks">
          {QUICK_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="dashboardQuickLink">
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
