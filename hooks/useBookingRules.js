/**
 * FILE: hooks/useBookingRules.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the single BookingRules settings row for the Booking Rules &
 * Configuration page (blueprint Page 7) and exposes a save mutation.
 * All axios calls to the booking-rules API happen here — never inline
 * inside a component (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const BOOKING_RULES_ENDPOINT = "/api/superAdmin/settings/booking-rules";

export function useBookingRules() {
  const [bookingRules, setBookingRules] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * fetchBookingRules
   * Loads the singleton settings row. Runs on mount and again after
   * every save so the form always reflects what's actually persisted.
   */
  const fetchBookingRules = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(BOOKING_RULES_ENDPOINT);
      setBookingRules(response.data.data ?? null);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookingRules();
  }, [fetchBookingRules]);

  /**
   * saveBookingRules
   * Persists the full settings payload, then refreshes local state so
   * the form's "last saved" values stay in sync with the DB.
   */
  const saveBookingRules = useCallback(
    async (payload) => {
      const response = await axios.put(BOOKING_RULES_ENDPOINT, payload);
      setBookingRules(response.data.data);
      return response.data;
    },
    []
  );

  return { bookingRules, isLoading, error, refetchBookingRules: fetchBookingRules, saveBookingRules };
}
