/**
 * FILE: hooks/useBookingConfirmationEmail.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the singleton BookingConfirmationEmail row (copy + attached
 * images) for the Booking Confirmation Email content page, and
 * exposes save/upload/update/delete/reorder mutations. All axios
 * calls to this feature's API happen here — never inline inside a
 * component (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const SETTINGS_ENDPOINT = "/api/superAdmin/content/booking-confirmation-email";
const IMAGES_ENDPOINT = `${SETTINGS_ENDPOINT}/images`;

export function useBookingConfirmationEmail() {
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * fetchSettings
   * Loads the singleton row (copy + images). Runs on mount and again
   * after every mutation so the page always reflects what's persisted.
   */
  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(SETTINGS_ENDPOINT);
      setSettings(response.data.data ?? null);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  /**
   * saveEmailContent
   * Persists the editable copy fields, then refreshes local state.
   */
  const saveEmailContent = useCallback(
    async (payload) => {
      const response = await axios.put(SETTINGS_ENDPOINT, payload);
      setSettings(response.data.data);
      return response.data;
    },
    []
  );

  /**
   * addEmailImage
   * Creates a new image record (the file itself is uploaded to R2 by
   * the caller first via the shared upload endpoint), then refreshes.
   */
  const addEmailImage = useCallback(
    async (payload) => {
      const response = await axios.post(IMAGES_ENDPOINT, payload);
      await fetchSettings();
      return response.data;
    },
    [fetchSettings]
  );

  /**
   * updateEmailImage
   * Updates an image's caption or display order, then refreshes.
   */
  const updateEmailImage = useCallback(
    async (imageId, payload) => {
      const response = await axios.put(`${IMAGES_ENDPOINT}/${imageId}`, payload);
      await fetchSettings();
      return response.data;
    },
    [fetchSettings]
  );

  /**
   * deleteEmailImage
   * Deletes an image by ID, then refreshes.
   */
  const deleteEmailImage = useCallback(
    async (imageId) => {
      const response = await axios.delete(`${IMAGES_ENDPOINT}/${imageId}`);
      await fetchSettings();
      return response.data;
    },
    [fetchSettings]
  );

  /**
   * moveEmailImage
   * Swaps displayOrder between an image and its neighbor — direction
   * is "up" or "down" — same swap pattern as Gallery's moveImageInCategory.
   */
  const moveEmailImage = useCallback(
    async (image, direction) => {
      const orderedImages = [...(settings?.images ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
      const currentIndex = orderedImages.findIndex((candidate) => candidate.id === image.id);
      const neighborIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      const neighbor = orderedImages[neighborIndex];
      if (!neighbor) return; // Already at the top or bottom — nothing to swap.

      await Promise.all([
        axios.put(`${IMAGES_ENDPOINT}/${image.id}`, { displayOrder: neighbor.displayOrder }),
        axios.put(`${IMAGES_ENDPOINT}/${neighbor.id}`, { displayOrder: image.displayOrder }),
      ]);
      await fetchSettings();
    },
    [settings, fetchSettings]
  );

  return {
    settings,
    isLoading,
    error,
    refetchSettings: fetchSettings,
    saveEmailContent,
    addEmailImage,
    updateEmailImage,
    deleteEmailImage,
    moveEmailImage,
  };
}
