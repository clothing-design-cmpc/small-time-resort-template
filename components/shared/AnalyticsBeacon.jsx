/**
 * FILE: components/shared/AnalyticsBeacon.jsx
 * PURPOSE:
 * Fires an anonymous, aggregate-only page-view beacon on route change.
 * No personal data or per-visitor identifiers are sent — this feeds the
 * PageViewDaily counters only (Rule 41). Mounted once in the root layout.
 */
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function AnalyticsBeacon() {
  const pathname = usePathname();

  // Fires once per route change — records an aggregate view, never a
  // per-visitor event, so this needs no consent banner (Rule 41.1).
  useEffect(() => {
    const payload = JSON.stringify({ path: pathname, referrer: document.referrer || null });

    try {
      navigator.sendBeacon("/api/analytics/track", payload);
    } catch (error) {
      // Analytics must never break the page — fail silently
      console.error("[AnalyticsBeacon] Failed to send:", error.message);
    }
  }, [pathname]);

  return null;
}