/**
 * FILE: hooks/useSeasonDefinitions.js
 * PURPOSE:
 * Fetches and mutates SeasonDefinition rows for Section 5's "Current
 * Philippine Seasons" info panel (app/superAdmin/(protected)/settings/
 * booking-rules/BookingRuleForm.jsx). Separate from useSeasonalPricing,
 * which manages the per-room SeasonalPrice override list instead.
 */
import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const SEASON_DEFINITIONS_ENDPOINT = "/api/superAdmin/settings/season-definitions";

export function useSeasonDefinitions() {
  const [seasonDefinitions, setSeasonDefinitions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSeasonDefinitions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get(SEASON_DEFINITIONS_ENDPOINT);
      setSeasonDefinitions(response.data.data);
    } catch {
      setError("We couldn't load the season definitions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSeasonDefinitions();
  }, [fetchSeasonDefinitions]);

  const createSeasonDefinition = useCallback(
    async (data) => {
      const response = await axios.post(SEASON_DEFINITIONS_ENDPOINT, data);
      await fetchSeasonDefinitions();
      return response.data;
    },
    [fetchSeasonDefinitions]
  );

  const updateSeasonDefinition = useCallback(
    async (seasonId, data) => {
      const response = await axios.put(`${SEASON_DEFINITIONS_ENDPOINT}/${seasonId}`, data);
      await fetchSeasonDefinitions();
      return response.data;
    },
    [fetchSeasonDefinitions]
  );

  const deleteSeasonDefinition = useCallback(
    async (seasonId) => {
      const response = await axios.delete(`${SEASON_DEFINITIONS_ENDPOINT}/${seasonId}`);
      await fetchSeasonDefinitions();
      return response.data;
    },
    [fetchSeasonDefinitions]
  );

  return {
    seasonDefinitions,
    isLoading,
    error,
    createSeasonDefinition,
    updateSeasonDefinition,
    deleteSeasonDefinition,
  };
}
