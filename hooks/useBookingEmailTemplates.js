/**
 * FILE: hooks/useBookingEmailTemplates.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches all 4 non-confirmation booking email templates (pending,
 * cancelled, auto_cancelled, rebooked) and exposes a save mutation for
 * one template at a time. All axios calls to this feature's API
 * happen here — never inline inside a component (Rule 31.2). The
 * "confirmed" template keeps using useBookingConfirmationEmail — this
 * hook never touches it.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const TEMPLATES_ENDPOINT = "/api/superAdmin/content/booking-email-templates";

export function useBookingEmailTemplates() {
  const [templates, setTemplates] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * fetchTemplates
   * Loads all 4 templates keyed by templateKey. Runs on mount and
   * again after every save so the tabs always reflect what's saved.
   */
  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(TEMPLATES_ENDPOINT);
      setTemplates(response.data.data ?? null);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  /**
   * saveTemplate
   * Persists one template's copy fields by key, then merges the
   * returned row back into local state (no full refetch needed).
   */
  const saveTemplate = useCallback(async (templateKey, payload) => {
    const response = await axios.put(TEMPLATES_ENDPOINT, { templateKey, ...payload });
    setTemplates((previous) => ({ ...previous, [templateKey]: response.data.data }));
    return response.data;
  }, []);

  return {
    templates,
    isLoading,
    error,
    saveTemplate,
  };
}
