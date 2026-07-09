/**
 * FILE: hooks/useGallery.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches every gallery image for the Gallery Management page
 * (blueprint Page 6) and exposes upload/update/delete/reorder
 * mutations. All axios calls to the gallery API happen here — never
 * inline inside a component (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const GALLERY_ENDPOINT = "/api/superAdmin/content/gallery";

export function useGallery() {
  const [galleryImages, setGalleryImages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * fetchGalleryImages
   * Loads every gallery image from the API. Runs on mount and again
   * after any upload/update/delete/reorder so the grid always reflects
   * the latest data.
   */
  const fetchGalleryImages = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(GALLERY_ENDPOINT);
      setGalleryImages(response.data.data ?? []);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGalleryImages();
  }, [fetchGalleryImages]);

  /**
   * uploadGalleryImage
   * Creates a new gallery image record (the file itself is uploaded to
   * R2 by the caller first via the shared upload endpoint), then
   * refreshes the grid.
   */
  const uploadGalleryImage = useCallback(
    async (payload) => {
      const response = await axios.post(GALLERY_ENDPOINT, payload);
      await fetchGalleryImages();
      return response.data;
    },
    [fetchGalleryImages]
  );

  /**
   * updateGalleryImage
   * Updates an existing gallery image's category, caption, or featured
   * state, then refreshes the grid.
   */
  const updateGalleryImage = useCallback(
    async (imageId, payload) => {
      const response = await axios.put(`${GALLERY_ENDPOINT}/${imageId}`, payload);
      await fetchGalleryImages();
      return response.data;
    },
    [fetchGalleryImages]
  );

  /**
   * deleteGalleryImage
   * Deletes a gallery image by ID, then refreshes the grid.
   */
  const deleteGalleryImage = useCallback(
    async (imageId) => {
      const response = await axios.delete(`${GALLERY_ENDPOINT}/${imageId}`);
      await fetchGalleryImages();
      return response.data;
    },
    [fetchGalleryImages]
  );

  /**
   * moveImageInCategory
   * Swaps displayOrder between an image and its neighbor within the
   * same category — direction is "up" or "down". Both images are the
   * ones currently visible in that category's sorted tab, so the swap
   * always matches what the admin sees on screen.
   */
  const moveImageInCategory = useCallback(
    async (image, direction) => {
      const imagesInSameCategory = galleryImages
        .filter((candidate) => candidate.category === image.category)
        .sort((a, b) => a.displayOrder - b.displayOrder);

      const currentIndex = imagesInSameCategory.findIndex((candidate) => candidate.id === image.id);
      const neighborIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      const neighbor = imagesInSameCategory[neighborIndex];
      if (!neighbor) return; // Already at the top or bottom — nothing to swap.

      await Promise.all([
        axios.put(`${GALLERY_ENDPOINT}/${image.id}`, { displayOrder: neighbor.displayOrder }),
        axios.put(`${GALLERY_ENDPOINT}/${neighbor.id}`, { displayOrder: image.displayOrder }),
      ]);
      await fetchGalleryImages();
    },
    [galleryImages, fetchGalleryImages]
  );

  return {
    galleryImages,
    isLoading,
    error,
    refetchGalleryImages: fetchGalleryImages,
    uploadGalleryImage,
    updateGalleryImage,
    deleteGalleryImage,
    moveImageInCategory,
  };
}
