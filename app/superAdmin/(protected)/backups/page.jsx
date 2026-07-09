/**
 * FILE: app/superAdmin/(protected)/backups/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Thin Server Component wrapper for the Backups history page (Rule
 * 40.6). All data fetching + pagination state lives client-side in
 * BackupLogsClient, same pattern as the Security Logs page.
 */
import BackupLogsClient from "./BackupLogsClient";
import "./Backups.css";

export const metadata = {
  title: "Backups | Super-Admin",
};

export default function BackupsPage() {
  return <BackupLogsClient />;
}
