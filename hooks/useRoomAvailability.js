/**
 * FILE: hooks/useRoomAvailability.js
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Fetches which dates are already unavailable (booked or blacked out)
 * for one specific room, so the booking form's date inputs can warn
 * the guest before they even submit. Refetches whenever `roomId` changes.
 */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";

export function useRoomAvailability(roomId) {
  const [availability, setAvailability] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!roomId) {
      setAvailability(null);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    axios
      .get(`/api/rooms/${roomId}/availability`)
      .then((response) => {
        if (!isCancelled) setAvailability(response.data.data);
      })
      .catch((fetchError) => {
        if (!isCancelled) setError(fetchError);
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [roomId]);

  return { availability, isLoading, error };
}
