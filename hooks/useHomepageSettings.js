/**
 * FILE: hooks/useHomepageSettings.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the homepage/SEO subset of the singleton SystemSettings row
 * for the Homepage Customization page (blueprint Page 9) and exposes
 * a save mutation. All axios calls to the homepage API happen here —
 * never inline inside a component (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const HOMEPAGE_ENDPOINT = "/api/superAdmin/content/homepage";

export function useHomepageSettings() {
  const [homepageSettings, setHomepageSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * fetchHomepageSettings
   * Loads the singleton settings row. Runs on mount and again after
   * every save so the form always reflects what's actually persisted.
   */
  const fetchHomepageSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(HOMEPAGE_ENDPOINT);
      setHomepageSettings(response.data.data ?? null);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHomepageSettings();
  }, [fetchHomepageSettings]);

  /**
   * saveHomepageSettings
   * Persists the full homepage/SEO payload, then refreshes local
   * state so the form's "last saved" values stay in sync with the DB.
   */
  const saveHomepageSettings = useCallback(async (payload) => {
    const response = await axios.put(HOMEPAGE_ENDPOINT, payload);
    setHomepageSettings(response.data.data);
    return response.data;
  }, []);

  return {
    homepageSettings,
    isLoading,
    error,
    refetchHomepageSettings: fetchHomepageSettings,
    saveHomepageSettings,
  };
}
