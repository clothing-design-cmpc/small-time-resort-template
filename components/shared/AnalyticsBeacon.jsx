/**
 * FILE: components/shared/AnalyticsBeacon.jsx
 * ROLE: Applies to all account types (mounted once in the root layout)
 *
 * PURPOSE:
 * Silently reports the current path to /api/analytics/track whenever
 * the route changes, so Rule 41 aggregate analytics have data to
 * count. Sends no personal data itself — only the path and the
 * referrer's hostname (never the full referrer URL, which could
 * contain query strings/identifiers).
 *
 * DATA FLOW:
 * 1. Mounted once in app/layout.jsx, inside every page
 * 2. usePathname() changes on every route navigation
 * 3. useEffect fires a beacon POST each time the path changes —
 *    uses navigator.sendBeacon when available so the request survives
 *    the visitor navigating away before it completes
 */
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function AnalyticsBeacon() {
  const pathname = usePathname();

  // Fires once per path change — reports the page view without
  // blocking or slowing down the actual page render.
  useEffect(() => {
    const referrerHost = document.referrer ? new URL(document.referrer).host : null;
    const payload = JSON.stringify({ path: pathname, referrerHost });

    if (navigator.sendBeacon) {
      // sendBeacon survives the user navigating away immediately after load.
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/track", blob);
    } else {
      fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {}); // Never surface an analytics failure to the visitor.
    }
  }, [pathname]);

  return null;
}
