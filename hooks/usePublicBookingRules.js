/**
 * FILE: hooks/usePublicBookingRules.js
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Fetches the read-only booking rules (nights range, advance window,
 * enabled booking types, tour pricing, deposit %) that drive the
 * visitor booking form's validation and summary panel. Separate from
 * hooks/useBookingRules.js, which hits the admin-only settings endpoint.
 *
 * @param {number|null} [nightsSelected] - nights the guest has currently
 *   selected for an Overnight stay (checkOutDate - checkInDate in days).
 *   Passed through as ?nights= so the server can match a specific rule
 *   set built for that exact night count (e.g. "4Ds-3Ns") instead of
 *   just whichever Active rule was most recently updated — see
 *   app/api/booking-rules/route.js. Refetches whenever this changes.
 */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";

export function usePublicBookingRules(nightsSelected = null) {
  const [bookingRules, setBookingRules] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    async function fetchRules() {
      try {
        const params = Number.isInteger(nightsSelected) && nightsSelected > 0 ? { nights: nightsSelected } : {};
        const response = await axios.get("/api/booking-rules", { params });
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
  }, [nightsSelected]);

  return { bookingRules, isLoading, error };
}
