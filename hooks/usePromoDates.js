/**
 * FILE: hooks/usePromoDates.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches every Promo Date entry (Booking Rules Section 5b) and exposes
 * create/update/delete mutations. All axios calls to the promo-dates API
 * happen here — never inline inside a component (Rule 31.2).
 *
 * createPromoDates() is a BATCH create — the admin taps one or more
 * calendar dates at once in PromoDatesSection.jsx, and this fires a
 * single POST with all of them plus the shared discount%/label/
 * appliesTo, rather than one request per date.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const PROMO_DATES_ENDPOINT = "/api/superAdmin/settings/promo-dates";

export function usePromoDates() {
  const [promoDates, setPromoDates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPromoDates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(PROMO_DATES_ENDPOINT);
      setPromoDates(response.data.data ?? []);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPromoDates();
  }, [fetchPromoDates]);

  const createPromoDates = useCallback(
    async (payload) => {
      const response = await axios.post(PROMO_DATES_ENDPOINT, payload);
      await fetchPromoDates();
      return response.data;
    },
    [fetchPromoDates]
  );

  const updatePromoDate = useCallback(
    async (promoId, payload) => {
      const response = await axios.put(`${PROMO_DATES_ENDPOINT}/${promoId}`, payload);
      await fetchPromoDates();
      return response.data;
    },
    [fetchPromoDates]
  );

  const deletePromoDate = useCallback(
    async (promoId) => {
      const response = await axios.delete(`${PROMO_DATES_ENDPOINT}/${promoId}`);
      await fetchPromoDates();
      return response.data;
    },
    [fetchPromoDates]
  );

  return {
    promoDates,
    isLoading,
    error,
    refetchPromoDates: fetchPromoDates,
    createPromoDates,
    updatePromoDate,
    deletePromoDate,
  };
}
