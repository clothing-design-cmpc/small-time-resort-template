/**
 * FILE: components/superAdmin/AccountActivityBeacon.jsx
 * ROLE: Super-admin only — must be mounted ONLY inside the authenticated
 * super-admin layout, never the public root layout. This structural
 * placement is what keeps this feature scoped to logged-in accounts
 * only (Rule 42), as opposed to Rule 41's anonymous aggregate analytics.
 *
 * PURPOSE:
 * Fires a beacon to /api/account-activity/track on every super-admin
 * route change, so the logged-in admin's navigation trail is recorded.
 *
 * DATA FLOW:
 * 1. Mounted once in app/superAdmin/layout.jsx
 * 2. usePathname() changes on every super-admin route navigation
 * 3. useEffect posts { path } — the API route resolves the actual
 *    accountId server-side from the session cookie, never trusting a
 *    client-supplied identity
 */
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function AccountActivityBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/account-activity/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {}); // Never surface a logging failure to the admin using the page.
  }, [pathname]);

  return null;
}
