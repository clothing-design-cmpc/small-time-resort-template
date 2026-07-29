/**
 * FILE: app/superAdmin/(protected)/reports/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Thin Server Component wrapper for the Reports page. All data
 * fetching lives client-side in ReportsClient (same pattern as the
 * Analytics / Backups / API Usage pages).
 */
import ReportsClient from "./ReportsClient";
import "./Reports.css";

export const metadata = {
  title: "Reports | Super-Admin",
};

export default function ReportsPage() {
  return <ReportsClient />;
}
