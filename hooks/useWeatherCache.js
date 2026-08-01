/**
 * FILE: hooks/useWeatherCache.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the current WeatherForecastCache row on mount
 * (GET /api/admin/weather) and exposes a refresh() action that POSTs
 * /api/admin/weather/refresh and swaps in the fresh result — backs the
 * Dashboard's Weather Forecast Cache widget
 * (WeatherCacheWidgetClient.jsx). Matches the pattern of
 * hooks/useAiInsight.js.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const LATEST_ENDPOINT = "/api/admin/weather";
const REFRESH_ENDPOINT = "/api/admin/weather/refresh";

export function useWeatherCache() {
  const [cache, setCache] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchLatest = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get(LATEST_ENDPOINT);
      setCache(response.data.data.cache);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  /**
   * refresh
   * Triggers a fresh on-demand Google Weather API call and refetches
   * the resulting cache row. Returns { success, message } so the
   * widget can show a toast either way.
   */
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await axios.post(REFRESH_ENDPOINT);
      await fetchLatest();
      return { success: true, message: response.data.message };
    } catch (refreshError) {
      return {
        success: false,
        message: refreshError.response?.data?.message || "Failed to refresh the forecast.",
      };
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchLatest]);

  return { cache, isLoading, isRefreshing, error, refetchCache: fetchLatest, refresh };
}
