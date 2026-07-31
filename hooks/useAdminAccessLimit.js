/**
 * FILE: hooks/useAdminAccessLimit.js
 * PURPOSE:
 * Fetches and saves the Admin Access Limit setting (how many admins
 * can be signed in to /superAdmin at the same time). Used by
 * AdminAccessLimitClient — never called directly from a page or from
 * inside JSX.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const ADMIN_ACCESS_LIMIT_ENDPOINT = "/api/superAdmin/settings/admin-access-limit";

export function useAdminAccessLimit() {
  const [maxAdminSessions, setMaxAdminSessions] = useState(null);
  const [activeSessionCount, setActiveSessionCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLimit = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get(ADMIN_ACCESS_LIMIT_ENDPOINT);
      setMaxAdminSessions(response.data.data?.maxAdminSessions ?? null);
      setActiveSessionCount(response.data.data?.activeSessionCount ?? 0);
    } catch {
      setError("We couldn't load this setting. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLimit();
  }, [fetchLimit]);

  const saveLimit = useCallback(
    async (newMaxAdminSessions) => {
      const response = await axios.put(ADMIN_ACCESS_LIMIT_ENDPOINT, {
        maxAdminSessions: newMaxAdminSessions,
      });
      await fetchLimit();
      return response.data;
    },
    [fetchLimit]
  );

  return {
    maxAdminSessions,
    activeSessionCount,
    isLoading,
    error,
    saveLimit,
    refetch: fetchLimit,
  };
}
