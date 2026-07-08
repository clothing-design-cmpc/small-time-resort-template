/**
 * FILE: hooks/useRooms.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the room list for the Rooms Management page and exposes a
 * deleteRoom mutation. All axios calls to the rooms API happen here —
 * never inline inside a component (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const ROOMS_ENDPOINT = "/api/superAdmin/content/rooms";

export function useRooms() {
  const [rooms, setRooms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * fetchRooms
   * Loads every room from the API. Runs on mount and again after any
   * create/update/delete so the list always reflects the latest data.
   */
  const fetchRooms = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(ROOMS_ENDPOINT);
      setRooms(response.data.data ?? []);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  /**
   * deleteRoom
   * Deletes a room by ID and refreshes the list. Returns the server's
   * response message so the caller can show the correct toast.
   */
  const deleteRoom = useCallback(
    async (roomId) => {
      const response = await axios.delete(`${ROOMS_ENDPOINT}/${roomId}`);
      await fetchRooms();
      return response.data;
    },
    [fetchRooms]
  );

  return { rooms, isLoading, error, refetchRooms: fetchRooms, deleteRoom };
}
