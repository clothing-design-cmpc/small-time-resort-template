/**
 * FILE: hooks/useRebookingPolicy.js
 * PURPOSE:
 * Fetches and updates the resort-wide Global Rebooking Policy for
 * RebookingPolicySection.jsx. Same fetch/update shape as
 * hooks/useRoomStatus.js uses for the Cleaning Hours setting.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const REBOOKING_POLICY_ENDPOINT = "/api/superAdmin/settings/rebooking-policy";

export function useRebookingPolicy() {
  const [policy, setPolicy] = useState({
    maxRebookingsAllowed: null,
    rebookingNonRefundableOnFirst: false,
    rebookingLimitAction: "non_refundable",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPolicy = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get(REBOOKING_POLICY_ENDPOINT);
      setPolicy(response.data.data);
    } catch {
      setError("We couldn't load the rebooking policy. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  const updatePolicy = useCallback(async (newPolicy) => {
    const response = await axios.put(REBOOKING_POLICY_ENDPOINT, newPolicy);
    setPolicy(response.data.data);
    return response.data;
  }, []);

  return { policy, isLoading, error, refetchPolicy: fetchPolicy, updatePolicy };
}
