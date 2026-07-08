/**
 * FILE: hooks/useShopConfig.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches and saves the singleton Shop Configuration row (hours,
 * location, alcohol warning text) for the Resort Shop Management page.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const SHOP_CONFIG_ENDPOINT = "/api/superAdmin/content/shop/config";

export function useShopConfig() {
  const [config, setConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(SHOP_CONFIG_ENDPOINT);
      setConfig(response.data.data);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  /**
   * saveConfig
   * Upserts the shop configuration and updates local state on success.
   */
  const saveConfig = useCallback(async (payload) => {
    const response = await axios.put(SHOP_CONFIG_ENDPOINT, payload);
    setConfig(response.data.data);
    return response.data;
  }, []);

  return { config, isLoading, error, saveConfig };
}
