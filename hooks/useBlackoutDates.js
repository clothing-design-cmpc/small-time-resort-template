/**
 * FILE: hooks/useBlackoutDates.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches every blackout date range (Booking Rules Section 6) and
 * exposes create/update/delete mutations. All axios calls to the
 * blackout-dates API happen here — never inline inside a component
 * (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const BLACKOUT_DATES_ENDPOINT = "/api/superAdmin/settings/blackout-dates";

export function useBlackoutDates() {
  const [blackoutDates, setBlackoutDates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBlackoutDates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(BLACKOUT_DATES_ENDPOINT);
      setBlackoutDates(response.data.data ?? []);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlackoutDates();
  }, [fetchBlackoutDates]);

  const createBlackoutDate = useCallback(
    async (payload) => {
      const response = await axios.post(BLACKOUT_DATES_ENDPOINT, payload);
      await fetchBlackoutDates();
      return response.data;
    },
    [fetchBlackoutDates]
  );

  const updateBlackoutDate = useCallback(
    async (blackoutId, payload) => {
      const response = await axios.put(`${BLACKOUT_DATES_ENDPOINT}/${blackoutId}`, payload);
      await fetchBlackoutDates();
      return response.data;
    },
    [fetchBlackoutDates]
  );

  const deleteBlackoutDate = useCallback(
    async (blackoutId) => {
      const response = await axios.delete(`${BLACKOUT_DATES_ENDPOINT}/${blackoutId}`);
      await fetchBlackoutDates();
      return response.data;
    },
    [fetchBlackoutDates]
  );

  return {
    blackoutDates,
    isLoading,
    error,
    refetchBlackoutDates: fetchBlackoutDates,
    createBlackoutDate,
    updateBlackoutDate,
    deleteBlackoutDate,
  };
}
