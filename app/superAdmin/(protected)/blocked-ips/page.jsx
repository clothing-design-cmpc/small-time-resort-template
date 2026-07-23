/**
 * FILE: app/superAdmin/(protected)/blocked-ips/page.jsx
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * Thin Server Component wrapper — all data fetching + pagination state
 * lives client-side in BlockedIpsClient, same pattern as the Security
 * Logs and Backups pages.
 */
import BlockedIpsClient from "./BlockedIpsClient";
import "./BlockedIps.css";

export const metadata = {
  title: "Blocked IPs | Super-Admin",
};

export default function BlockedIpsPage() {
  return <BlockedIpsClient />;
}
