/**
 * FILE: hooks/useMarketingInsights.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the Dashboard's "Marketing Insights" data (Recent Bookings,
 * Top Performing Rooms, Repeat Guest Rate) on mount. Read-only — no
 * mutations, so this hook only ever exposes a refetch, matching the
 * pattern of useDashboardStats.js.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const MARKETING_INSIGHTS_ENDPOINT = "/api/admin/marketing-insights";

export function useMarketingInsights() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchInsights = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get(MARKETING_INSIGHTS_ENDPOINT);
      setData(response.data.data);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  return { data, isLoading, error, refetchInsights: fetchInsights };
}
