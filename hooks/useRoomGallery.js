/**
 * FILE: hooks/useRoomGallery.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the RoomImage list for one room's Room Gallery sub-page and
 * exposes upload/update/setAsMain/delete mutations. All axios calls to
 * the gallery API happen here — never inline inside a component
 * (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

export function useRoomGallery(roomId) {
  const [images, setImages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const galleryEndpoint = `/api/superAdmin/content/rooms/${roomId}/gallery`;

  const fetchImages = useCallback(async () => {
    if (!roomId) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(galleryEndpoint);
      setImages(response.data.data ?? []);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [galleryEndpoint, roomId]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  /**
   * uploadImage
   * Uploads the file to R2 via the shared upload endpoint, then saves
   * the resulting url/key as a new RoomImage row.
   */
  const uploadImage = useCallback(
    async (file, caption) => {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      uploadFormData.append("folder", "rooms");

      const uploadResponse = await axios.post("/api/superAdmin/content/upload", uploadFormData);
      const { url, key } = uploadResponse.data.data;

      const response = await axios.post(galleryEndpoint, { imageUrl: url, imageKey: key, caption });
      await fetchImages();
      return response.data;
    },
    [galleryEndpoint, fetchImages]
  );

  const setAsMain = useCallback(
    async (imageId) => {
      const response = await axios.put(`${galleryEndpoint}/${imageId}`, { setAsMain: true });
      await fetchImages();
      return response.data;
    },
    [galleryEndpoint, fetchImages]
  );

  const toggleFeatured = useCallback(
    async (imageId, isFeatured) => {
      const response = await axios.put(`${galleryEndpoint}/${imageId}`, { isFeatured });
      await fetchImages();
      return response.data;
    },
    [galleryEndpoint, fetchImages]
  );

  const deleteImage = useCallback(
    async (imageId) => {
      const response = await axios.delete(`${galleryEndpoint}/${imageId}`);
      await fetchImages();
      return response.data;
    },
    [galleryEndpoint, fetchImages]
  );

  return {
    images,
    isLoading,
    error,
    refetchImages: fetchImages,
    uploadImage,
    setAsMain,
    toggleFeatured,
    deleteImage,
  };
}
