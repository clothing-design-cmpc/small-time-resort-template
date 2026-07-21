/**
 * FILE: app/superAdmin/(protected)/dashboard/DashboardStatsClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the dashboard's 4-column KPI stat row using live data from
 * useDashboardStats() instead of the old hardcoded STAT_CARDS array.
 * Handles the three required states per Rule 25: loading skeleton,
 * error with retry, and the real StatCard grid.
 *
 * DATA FLOW:
 * 1. Mounted by page.jsx (a Server Component) as the interactive piece
 * 2. useDashboardStats() fetches GET /api/admin/dashboard-stats on mount
 * 3. Renders skeleton -> cards, or a retry-capable error message
 */
"use client";

import { useDashboardStats } from "@/hooks/useDashboardStats";
import StatCard from "@/components/superAdmin/StatCard";

export default function DashboardStatsClient() {
  const { cards, isLoading, loadError, refetch } = useDashboardStats();

  // Loading state — skeleton mirrors the 4-card grid shape while data is fetched
  if (isLoading) {
    return (
      <div className="dashboardGrid">
        {[0, 1, 2, 3].map((skeletonIndex) => (
          <div key={skeletonIndex} className="statCardSkeleton" aria-hidden="true">
            <div className="skeletonBlock statCardSkeletonLabel" />
            <div className="skeletonBlock statCardSkeletonValue" />
            <div className="skeletonBlock statCardSkeletonTrend" />
          </div>
        ))}
      </div>
    );
  }

  // Error state — never expose the raw fetch error, always offer a retry
  if (loadError) {
    return (
      <div className="dashboardStatsError">
        <p>{loadError}</p>
        <button type="button" onClick={refetch} className="dashboardStatsRetryButton">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="dashboardGrid">
      {cards.map((stat) => (
        <StatCard key={stat.id} {...stat} />
      ))}
    </div>
  );
}
