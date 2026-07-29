/**
 * FILE: app/superAdmin/(protected)/api-usage/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Thin Server Component wrapper for the API Usage page. All data
 * fetching lives client-side in ApiUsageClient (same pattern as the
 * Security Logs / Analytics / Backups pages).
 */
import ApiUsageClient from "./ApiUsageClient";
import "./ApiUsage.css";

export const metadata = {
  title: "API Usage | Super-Admin",
};

export default function ApiUsagePage() {
  return <ApiUsageClient />;
}
