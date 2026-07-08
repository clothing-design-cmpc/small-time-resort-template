/**
 * FILE: hooks/usePublicBookingRules.js
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Fetches the read-only booking rules (nights range, advance window,
 * enabled booking types, tour pricing, deposit %) that drive the
 * visitor booking form's validation and summary panel. Separate from
 * hooks/useBookingRules.js, which hits the admin-only settings endpoint.
 */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";

export function usePublicBookingRules() {
  const [bookingRules, setBookingRules] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    async function fetchRules() {
      try {
        const response = await axios.get("/api/booking-rules");
        if (!isCancelled) setBookingRules(response.data.data);
      } catch (fetchError) {
        if (!isCancelled) setError(fetchError);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    fetchRules();
    return () => {
      isCancelled = true;
    };
  }, []);

  return { bookingRules, isLoading, error };
}
