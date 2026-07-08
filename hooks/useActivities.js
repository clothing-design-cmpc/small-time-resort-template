/**
 * FILE: hooks/useActivities.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the activity list for the Activities Management page and
 * exposes a deleteActivity mutation. All axios calls to the activities
 * API happen here — never inline inside a component (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const ACTIVITIES_ENDPOINT = "/api/superAdmin/content/activities";

export function useActivities() {
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * fetchActivities
   * Loads every activity from the API. Runs on mount and again after
   * any create/update/delete so the list always reflects the latest data.
   */
  const fetchActivities = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(ACTIVITIES_ENDPOINT);
      setActivities(response.data.data ?? []);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  /**
   * deleteActivity
   * Deletes an activity by ID and refreshes the list.
   */
  const deleteActivity = useCallback(
    async (activityId) => {
      const response = await axios.delete(`${ACTIVITIES_ENDPOINT}/${activityId}`);
      await fetchActivities();
      return response.data;
    },
    [fetchActivities]
  );

  return { activities, isLoading, error, refetchActivities: fetchActivities, deleteActivity };
}
