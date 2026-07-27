/**
 * FILE: hooks/useAvailableRooms.js
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Fetches every room available for a given check-in/check-out range,
 * used by components/RoomSelectionModal.jsx. Kept separate from
 * hooks/usePublicRooms.js (which returns ALL active rooms regardless
 * of dates) since this hook only ever runs after the homepage
 * calendar has already confirmed a matching BookingRule exists for
 * the selected dates. All axios calls to the endpoint happen here —
 * never inline inside a component (Rule 31.2).
 *
 * @param {string|null} checkInDate  - "YYYY-MM-DD", or null to skip fetching
 * @param {string|null} checkOutDate - "YYYY-MM-DD", or null (single-date selection)
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

export function useAvailableRooms(checkInDate, checkOutDate) {
  const [rooms, setRooms] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAvailableRooms = useCallback(async () => {
    if (!checkInDate) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get("/api/rooms/available", {
        params: { checkin: checkInDate, checkout: checkOutDate || checkInDate },
      });
      setRooms(response.data.data ?? []);
    } catch (fetchError) {
      setError(fetchError.response?.data?.message || "We couldn't load available rooms. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [checkInDate, checkOutDate]);

  useEffect(() => {
    fetchAvailableRooms();
  }, [fetchAvailableRooms]);

  return { rooms, isLoading, error, refetchAvailableRooms: fetchAvailableRooms };
}
