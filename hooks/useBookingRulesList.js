/**
 * FILE: hooks/useBookingRulesList.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches every BookingRule set for the Booking Rules list page and
 * exposes delete/activate mutations. All axios calls to the
 * booking-rules API happen here — never inline inside a component
 * (Rule 31.2). Replaces the old useBookingRules.js, which only ever
 * fetched a single locked settings row.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const BOOKING_RULES_ENDPOINT = "/api/superAdmin/settings/booking-rules";

export function useBookingRulesList() {
  const [bookingRules, setBookingRules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * fetchBookingRules
   * Loads every rule set. Runs on mount and again after any
   * create/update/delete/activate so the list always reflects the
   * latest data.
   */
  const fetchBookingRules = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(BOOKING_RULES_ENDPOINT);
      setBookingRules(response.data.data ?? []);
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
   * deleteBookingRule
   * Deletes a rule set by ID and refreshes the list. The API blocks
   * deleting the currently active rule set or the last one remaining.
   */
  const deleteBookingRule = useCallback(
    async (ruleId) => {
      const response = await axios.delete(`${BOOKING_RULES_ENDPOINT}/${ruleId}`);
      await fetchBookingRules();
      return response.data;
    },
    [fetchBookingRules]
  );

  /**
   * activateBookingRule
   * Marks the given rule set as the resort-wide active one and
   * refreshes the list so every row's status badge updates together.
   */
  const activateBookingRule = useCallback(
    async (ruleId) => {
      const response = await axios.post(`${BOOKING_RULES_ENDPOINT}/${ruleId}/activate`);
      await fetchBookingRules();
      return response.data;
    },
    [fetchBookingRules]
  );

  return {
    bookingRules,
    isLoading,
    error,
    refetchBookingRules: fetchBookingRules,
    deleteBookingRule,
    activateBookingRule,
  };
}
