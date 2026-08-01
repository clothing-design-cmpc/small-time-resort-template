/**
 * FILE: hooks/usePendingHoldHours.js
 * PURPOSE:
 * Fetches and updates the resort-wide DP Countdown setting
 * (SystemSettings.pendingHoldHours) for the Booking Rules settings
 * page's DP Countdown section. Same shape as hooks/useRoomStatus.js's
 * cleaning-hours handling, split out on its own since this setting has
 * nothing to do with room status.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const PENDING_HOLD_HOURS_ENDPOINT = "/api/superAdmin/settings/pending-hold-hours";

export function usePendingHoldHours() {
  const [pendingHoldHours, setPendingHoldHours] = useState(8);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPendingHoldHours = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get(PENDING_HOLD_HOURS_ENDPOINT);
      setPendingHoldHours(response.data.data?.pendingHoldHours ?? 8);
    } catch {
      setError("We couldn't load the DP Countdown setting. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingHoldHours();
  }, [fetchPendingHoldHours]);

  const updatePendingHoldHours = useCallback(async (newPendingHoldHours) => {
    const response = await axios.put(PENDING_HOLD_HOURS_ENDPOINT, { pendingHoldHours: newPendingHoldHours });
    setPendingHoldHours(response.data.data?.pendingHoldHours ?? newPendingHoldHours);
    return response.data;
  }, []);

  return {
    pendingHoldHours,
    isLoading,
    error,
    refetchPendingHoldHours: fetchPendingHoldHours,
    updatePendingHoldHours,
  };
}
