/**
 * FILE: app/superAdmin/(protected)/security-logs/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Thin Server Component wrapper — all data fetching happens client-side
 * in SecurityLogsClient (pagination + filter state don't belong in a
 * Server Component here since they change from user interaction).
 */
import SecurityLogsClient from "./SecurityLogsClient";
import "./SecurityLogs.css";

export const metadata = {
  title: "Security Logs | Super-Admin",
};

export default function SecurityLogsPage() {
  return <SecurityLogsClient />;
}
