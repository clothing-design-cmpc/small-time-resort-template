/**
 * FILE: hooks/usePublicRoom.js
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Fetches one room's visitor-facing details (with amenities resolved)
 * by id — used by app/visitor/booking/ReservationSummaryClient.jsx to
 * display the room the visitor already picked in RoomSelectionModal.
 * Separate from hooks/usePublicRooms.js (list) and
 * hooks/useAvailableRooms.js (list filtered by date range) since this
 * one only ever needs a single, already-chosen room.
 *
 * @param {string|null} roomId
 */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";

export function usePublicRoom(roomId) {
  const [room, setRoom] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!roomId) {
      setIsLoading(false);
      return;
    }

    let isCancelled = false;

    async function fetchRoom() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await axios.get(`/api/rooms/${roomId}`);
        if (!isCancelled) setRoom(response.data.data);
      } catch (fetchError) {
        if (!isCancelled) {
          setError(fetchError.response?.data?.message || "We couldn't load this room. Please try again.");
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    fetchRoom();
    return () => {
      isCancelled = true;
    };
  }, [roomId]);

  return { room, isLoading, error };
}
