/**
 * FILE: app/superAdmin/login/IdleTimeoutNotice.jsx
 * ROLE: Public — rendered on the super-admin login page only
 *
 * PURPOSE:
 * Shows a plain-English reason when the admin was just redirected here
 * by one of the automatic sign-out guards, instead of landing back on a
 * bare login form with no explanation for why they were signed out.
 * Split into its own file so only this small piece needs the Suspense
 * boundary useSearchParams() requires — the rest of the login page
 * renders immediately without waiting on it.
 *
 * DATA FLOW:
 * 1. A guard redirects here with one of:
 *    - ?reason=idle-timeout      — components/superAdmin/IdleTimeoutGuard.jsx,
 *      after 30 minutes of no mouse/keyboard/scroll/touch activity
 *    - ?reason=session-expired   — components/superAdmin/SessionExpiryGuard.jsx,
 *      after any admin API call came back 401 or a post-sleep/refocus
 *      re-check found the session already gone (cookie expired, cleared
 *      by SessionCloseGuard's tab-close beacon, or an idle timeout that
 *      already fired in another tab)
 *    - ?reason=magic-link-invalid — app/api/auth/magic-login/route.js,
 *      after a one-time owner-verified-IP sign-in link was already used,
 *      expired (10 minutes), or was simply invalid
 * 2. This component reads that query param and renders the matching notice
 * 3. Any other/missing reason value renders nothing
 */
"use client";

import { useSearchParams } from "next/navigation";

const REASON_MESSAGES = {
  "idle-timeout": "Your session expired due to inactivity. Please log in again.",
  "session-expired": "Your session has expired. Please log in again.",
  "magic-link-invalid":
    "That sign-in link has expired or was already used. Please sign in with your password, or wait for a new link after 5 failed attempts.",
};

export default function IdleTimeoutNotice() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const message = REASON_MESSAGES[reason];

  if (!message) return null;

  return (
    <p role="status" className="loginInfoBanner">
      {message}
    </p>
  );
}
