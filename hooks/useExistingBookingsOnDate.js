/**
 * FILE: hooks/useExistingBookingsOnDate.js
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Fetches every pending/confirmed booking overlapping the given
 * check-in/check-out range (app/api/bookings/existing-on-date/route.js),
 * used by components/RoomSelectionModal.jsx to show a small "someone
 * already has a booking on this date" context banner. Same shape/
 * pattern as hooks/useAvailableRooms.js — kept in its own hook rather
 * than inlined so RoomSelectionModal never calls axios directly
 * (Rule 31.2).
 *
 * @param {string|null} checkInDate  - "YYYY-MM-DD", or null to skip fetching
 * @param {string|null} checkOutDate - "YYYY-MM-DD", or null (single-date selection)
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

export function useExistingBookingsOnDate(checkInDate, checkOutDate) {
  const [existingBookings, setExistingBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchExistingBookings = useCallback(async () => {
    if (!checkInDate) {
      setExistingBookings([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.get("/api/bookings/existing-on-date", {
        params: { checkin: checkInDate, checkout: checkOutDate || checkInDate },
      });
      setExistingBookings(response.data.data ?? []);
    } catch {
      // Purely informational banner — a failed fetch here should never
      // block room selection, so it just quietly shows nothing instead
      // of an error state.
      setExistingBookings([]);
    } finally {
      setIsLoading(false);
    }
  }, [checkInDate, checkOutDate]);

  useEffect(() => {
    fetchExistingBookings();
  }, [fetchExistingBookings]);

  return { existingBookings, isLoading };
}
