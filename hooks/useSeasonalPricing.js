/**
 * FILE: hooks/useSeasonalPricing.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches every seasonal price entry (Booking Rules Section 5) and
 * exposes create/update/delete mutations. All axios calls to the
 * seasonal-pricing API happen here — never inline inside a component
 * (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const SEASONAL_PRICING_ENDPOINT = "/api/superAdmin/settings/seasonal-pricing";

export function useSeasonalPricing() {
  const [seasonalPrices, setSeasonalPrices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSeasonalPrices = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(SEASONAL_PRICING_ENDPOINT);
      setSeasonalPrices(response.data.data ?? []);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSeasonalPrices();
  }, [fetchSeasonalPrices]);

  const createSeasonalPrice = useCallback(
    async (payload) => {
      const response = await axios.post(SEASONAL_PRICING_ENDPOINT, payload);
      await fetchSeasonalPrices();
      return response.data;
    },
    [fetchSeasonalPrices]
  );

  const updateSeasonalPrice = useCallback(
    async (seasonId, payload) => {
      const response = await axios.put(`${SEASONAL_PRICING_ENDPOINT}/${seasonId}`, payload);
      await fetchSeasonalPrices();
      return response.data;
    },
    [fetchSeasonalPrices]
  );

  const deleteSeasonalPrice = useCallback(
    async (seasonId) => {
      const response = await axios.delete(`${SEASONAL_PRICING_ENDPOINT}/${seasonId}`);
      await fetchSeasonalPrices();
      return response.data;
    },
    [fetchSeasonalPrices]
  );

  return {
    seasonalPrices,
    isLoading,
    error,
    refetchSeasonalPrices: fetchSeasonalPrices,
    createSeasonalPrice,
    updateSeasonalPrice,
    deleteSeasonalPrice,
  };
}
