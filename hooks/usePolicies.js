/**
 * FILE: hooks/usePolicies.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the policy + contact-info subset of the singleton
 * SystemSettings row for the Policies & Content Pages page (blueprint
 * Page 8) and exposes a save mutation. All axios calls to the
 * policies API happen here — never inline inside a component
 * (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const POLICIES_ENDPOINT = "/api/superAdmin/content/policies";

export function usePolicies() {
  const [policies, setPolicies] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * fetchPolicies
   * Loads the singleton settings row. Runs on mount and again after
   * every save so the form always reflects what's actually persisted.
   */
  const fetchPolicies = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(POLICIES_ENDPOINT);
      setPolicies(response.data.data ?? null);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  /**
   * savePolicies
   * Persists the full policies + contact-info payload, then refreshes
   * local state so the form's "last saved" values stay in sync with
   * the DB.
   */
  const savePolicies = useCallback(async (payload) => {
    const response = await axios.put(POLICIES_ENDPOINT, payload);
    setPolicies(response.data.data);
    return response.data;
  }, []);

  return { policies, isLoading, error, refetchPolicies: fetchPolicies, savePolicies };
}
