/**
 * FILE: app/superAdmin/(protected)/email-logs/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Thin Server Component wrapper for the Email Logs page (Task 1 —
 * detect sent/failed emails, resend with information autofilled). All
 * data fetching + pagination/filter state lives client-side in
 * EmailLogsClient, same pattern as the Security Logs and Backups pages.
 */
import EmailLogsClient from "./EmailLogsClient";
import "./EmailLogs.css";

export const metadata = {
  title: "Email Logs | Super-Admin",
};

export default function EmailLogsPage() {
  return <EmailLogsClient />;
}
