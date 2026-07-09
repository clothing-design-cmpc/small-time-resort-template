/**
 * FILE: app/superAdmin/(protected)/analytics/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Thin Server Component wrapper — all data fetching happens client-side
 * in AnalyticsClient (same pattern as the Security Logs page).
 */
import AnalyticsClient from "./AnalyticsClient";
import "./Analytics.css";

export const metadata = {
  title: "Analytics | Super-Admin",
};

export default function AnalyticsPage() {
  return <AnalyticsClient />;
}
