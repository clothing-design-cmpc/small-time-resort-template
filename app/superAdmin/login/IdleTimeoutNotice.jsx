/**
 * FILE: app/superAdmin/login/IdleTimeoutNotice.jsx
 * ROLE: Public — rendered on the super-admin login page only
 *
 * PURPOSE:
 * Shows "Your session expired due to inactivity." when the admin was
 * just redirected here by components/superAdmin/IdleTimeoutGuard.jsx
 * (?reason=idle-timeout), instead of landing back on a bare login form
 * with no explanation for why they were signed out. Split into its own
 * file so only this small piece needs the Suspense boundary
 * useSearchParams() requires — the rest of the login page renders
 * immediately without waiting on it.
 *
 * DATA FLOW:
 * 1. IdleTimeoutGuard redirects to /superAdmin/login?reason=idle-timeout
 *    after 30 minutes of inactivity
 * 2. This component reads that query param and renders the notice
 * 3. Any other/missing reason value renders nothing
 */
"use client";

import { useSearchParams } from "next/navigation";

export default function IdleTimeoutNotice() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  if (reason !== "idle-timeout") return null;

  return (
    <p role="status" className="loginInfoBanner">
      Your session expired due to inactivity. Please log in again.
    </p>
  );
}
