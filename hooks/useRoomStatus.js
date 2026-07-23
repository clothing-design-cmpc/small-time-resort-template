/**
 * FILE: hooks/useRoomStatus.js
 * PURPOSE:
 * Fetches the computed room-status list (services/roomStatus.js) and
 * the general cleaning-hours setting for Section 6's room card grid.
 * Refetch after any manual override mutation (create/update/delete a
 * BlackoutDate) so a room's card immediately reflects the change.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const ROOM_STATUS_ENDPOINT = "/api/superAdmin/settings/room-status";
const CLEANING_HOURS_ENDPOINT = "/api/superAdmin/settings/cleaning-hours";

export function useRoomStatus() {
  const [roomStatuses, setRoomStatuses] = useState([]);
  const [cleaningHours, setCleaningHours] = useState(2);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRoomStatuses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [statusResponse, cleaningResponse] = await Promise.all([
        axios.get(ROOM_STATUS_ENDPOINT),
        axios.get(CLEANING_HOURS_ENDPOINT),
      ]);
      setRoomStatuses(statusResponse.data.data ?? []);
      setCleaningHours(cleaningResponse.data.data?.cleaningHours ?? 2);
    } catch {
      setError("We couldn't load room statuses. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoomStatuses();
  }, [fetchRoomStatuses]);

  const updateCleaningHours = useCallback(
    async (newCleaningHours) => {
      const response = await axios.put(CLEANING_HOURS_ENDPOINT, { cleaningHours: newCleaningHours });
      await fetchRoomStatuses();
      return response.data;
    },
    [fetchRoomStatuses]
  );

  return {
    roomStatuses,
    cleaningHours,
    isLoading,
    error,
    refetchRoomStatuses: fetchRoomStatuses,
    updateCleaningHours,
  };
}
