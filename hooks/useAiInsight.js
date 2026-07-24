/**
 * FILE: hooks/useAiInsight.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the latest AI Sales Insight on mount (GET /api/admin/ai-insight)
 * and exposes a regenerate() action that POSTs
 * /api/admin/ai-insight/regenerate and swaps in the fresh result —
 * backs the Dashboard's AI Sales Insight widget
 * (AiInsightWidgetClient.jsx). Matches the pattern of
 * hooks/useMarketingInsights.js.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const LATEST_ENDPOINT = "/api/admin/ai-insight";
const REGENERATE_ENDPOINT = "/api/admin/ai-insight/regenerate";

export function useAiInsight() {
  const [insight, setInsight] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState(null);

  const fetchLatest = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get(LATEST_ENDPOINT);
      setInsight(response.data.data.insight);
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
   * regenerate
   * Triggers a fresh on-demand insight generation and replaces the
   * currently displayed row with it. Returns { success, message } so
   * the widget can show a toast either way.
   */
  const regenerate = useCallback(async () => {
    setIsRegenerating(true);
    try {
      const response = await axios.post(REGENERATE_ENDPOINT);
      setInsight(response.data.data.insight);
      return { success: true, message: response.data.message };
    } catch (regenerateError) {
      return {
        success: false,
        message: regenerateError.response?.data?.message || "Failed to regenerate the insight.",
      };
    } finally {
      setIsRegenerating(false);
    }
  }, []);

  return { insight, isLoading, isRegenerating, error, refetchInsight: fetchLatest, regenerate };
}
