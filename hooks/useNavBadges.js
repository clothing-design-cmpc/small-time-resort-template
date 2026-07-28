/**
 * FILE: hooks/useNavBadges.js
 * PURPOSE:
 * Fetches the two Sidebar nav badge counts (pending walk-in inquiries,
 * new bookings) on mount and re-polls them on an interval, so the
 * badges stay live without the admin needing to refresh the page.
 *
 * DATA FLOW:
 * 1. Sidebar.jsx calls this hook once
 * 2. Fetches GET /api/admin/nav-badges immediately, then every 30s
 * 3. Returns { pendingWalkInCount, newBookingsCount } — both default to
 *    0 so the Sidebar never has to null-check before rendering a badge
 */
"use client";

import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 30000; // 30 seconds — frequent enough to feel live, cheap enough to never throttle the admin

export function useNavBadges() {
  const [badgeCounts, setBadgeCounts] = useState({ pendingWalkInCount: 0, newBookingsCount: 0 });

  useEffect(() => {
    let isCancelled = false;

    // Fetches the latest badge counts; silently keeps the last known
    // values on failure so a single dropped request never flashes the
    // badges to zero.
    async function fetchBadgeCounts() {
      try {
        const response = await fetch("/api/admin/nav-badges");
        const result = await response.json();
        if (!isCancelled && result.success) {
          setBadgeCounts({
            pendingWalkInCount: result.data.pendingWalkInCount,
            newBookingsCount: result.data.newBookingsCount,
          });
        }
      } catch {
        // Network hiccup — keep showing the last known counts.
      }
    }

    fetchBadgeCounts();
    const intervalId = setInterval(fetchBadgeCounts, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return badgeCounts;
}
