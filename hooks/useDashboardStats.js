/**
 * FILE: hooks/useDashboardStats.js
 * ROLE: Super-admin — used by the Dashboard page's client stat grid
 *
 * PURPOSE:
 * Fetches the live KPI cards from /api/admin/dashboard-stats and
 * exposes loading/error/data state so the dashboard can render a
 * skeleton, an error state with retry, or the real numbers per Rule 25.
 *
 * DATA FLOW:
 * 1. Called from DashboardStatsClient.jsx on mount
 * 2. GET /api/admin/dashboard-stats — session-protected via requireSuperAdmin()
 * 3. Returns { cards, isLoading, loadError, refetch }
 */
import { useCallback, useEffect, useState } from "react";

export function useDashboardStats() {
  const [cards, setCards] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/admin/dashboard-stats");
      const result = await response.json();

      if (!result.success) {
        setLoadError(result.message || "Failed to load dashboard stats. Please try again.");
        return;
      }

      setCards(result.data.cards);
    } catch {
      // Network-level failure (server unreachable, etc.) — never expose raw error to the UI
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { cards, isLoading, loadError, refetch: fetchStats };
}
