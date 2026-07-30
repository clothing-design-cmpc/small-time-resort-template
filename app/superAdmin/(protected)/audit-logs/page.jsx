/**
 * FILE: app/superAdmin/(protected)/audit-logs/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Thin Server Component wrapper — all data fetching happens client-side
 * in AuditLogsClient (pagination + filter state don't belong in a
 * Server Component here since they change from user interaction).
 */
import AuditLogsClient from "./AuditLogsClient";
import "./AuditLogs.css";

export const metadata = {
  title: "Audit Logs | Super-Admin",
};

export default function AuditLogsPage() {
  return <AuditLogsClient />;
}
