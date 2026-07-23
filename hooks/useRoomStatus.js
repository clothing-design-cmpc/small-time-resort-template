/**
 * FILE: hooks/useRoomStatus.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the live status (Booked/Cleaning/Available/manual override)
 * of every room for the Booking Rules Section 6 showcase. Read-only —
 * no mutations live here, those stay on useBlackoutDates.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const ROOM_STATUS_ENDPOINT = "/api/superAdmin/settings/room-status";

export function useRoomStatus() {
  const [roomStatuses, setRoomStatuses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRoomStatuses = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(ROOM_STATUS_ENDPOINT);
      setRoomStatuses(response.data.data ?? []);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoomStatuses();
  }, [fetchRoomStatuses]);

  return { roomStatuses, isLoading, error, refetchRoomStatuses: fetchRoomStatuses };
}
