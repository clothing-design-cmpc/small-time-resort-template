/**
 * FILE: app/superAdmin/(protected)/account-activity/page.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Thin Server Component wrapper — data fetching happens client-side in
 * AccountActivityClient, same pattern as Security Logs and Analytics.
 */
import AccountActivityClient from "./AccountActivityClient";
import "./AccountActivity.css";

export const metadata = {
  title: "Account Activity | Super-Admin",
};

export default function AccountActivityPage() {
  return <AccountActivityClient />;
}
