/**
 * FILE: hooks/useAmenities.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the amenities list for the Amenities Management page
 * (blueprint Page 2) and exposes create/update/delete mutations. All
 * axios calls to the amenities API happen here — never inline inside
 * a component (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const AMENITIES_ENDPOINT = "/api/superAdmin/content/amenities";

export function useAmenities() {
  const [amenities, setAmenities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * fetchAmenities
   * Loads every amenity from the API. Runs on mount and again after any
   * create/update/delete so the list always reflects the latest data.
   */
  const fetchAmenities = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(AMENITIES_ENDPOINT);
      setAmenities(response.data.data ?? []);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAmenities();
  }, [fetchAmenities]);

  /**
   * createAmenity
   * Creates a new amenity, then refreshes the list. Throws on failure
   * so the caller's try/catch can show the correct error toast.
   */
  const createAmenity = useCallback(
    async (payload) => {
      const response = await axios.post(AMENITIES_ENDPOINT, payload);
      await fetchAmenities();
      return response.data;
    },
    [fetchAmenities]
  );

  /**
   * updateAmenity
   * Updates an existing amenity by ID, then refreshes the list.
   */
  const updateAmenity = useCallback(
    async (amenityId, payload) => {
      const response = await axios.put(`${AMENITIES_ENDPOINT}/${amenityId}`, payload);
      await fetchAmenities();
      return response.data;
    },
    [fetchAmenities]
  );

  /**
   * deleteAmenity
   * Deletes an amenity by ID, then refreshes the list.
   */
  const deleteAmenity = useCallback(
    async (amenityId) => {
      const response = await axios.delete(`${AMENITIES_ENDPOINT}/${amenityId}`);
      await fetchAmenities();
      return response.data;
    },
    [fetchAmenities]
  );

  return {
    amenities,
    isLoading,
    error,
    refetchAmenities: fetchAmenities,
    createAmenity,
    updateAmenity,
    deleteAmenity,
  };
}
