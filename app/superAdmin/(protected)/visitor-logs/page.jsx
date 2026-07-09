/**
 * FILE: app/superAdmin/(protected)/visitor-logs/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Thin Server Component wrapper — all data fetching happens client-side
 * in VisitorLogsClient (pagination + filter state don't belong in a
 * Server Component here since they change from user interaction).
 */
import VisitorLogsClient from "./VisitorLogsClient";
import "./VisitorLogs.css";

export const metadata = {
  title: "Visitor Logs | Super-Admin",
};

export default function VisitorLogsPage() {
  return <VisitorLogsClient />;
}
