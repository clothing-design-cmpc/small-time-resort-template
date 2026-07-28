/**
 * FILE: hooks/useBookedDates.js
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Fetches GET /api/bookings/dates once on mount and exposes the
 * per-type booked-date sets as ready-to-use Set objects — same source
 * of truth used by the homepage calendar (HowToBookSection.jsx) and
 * the manual "Book Now" form (BookingFormClient.jsx), so both surfaces
 * agree on which dates are blocked for which booking type.
 *
 * overnightBlocksDayTourDates (and its Set form,
 * overnightBlocksDayTourSet) is the one that matters for hiding Day
 * Tour specifically — it includes the checkout day of an overnight
 * stay, unlike overnightBookedDates, which deliberately excludes it (a
 * checkout day must stay open for a NEW overnight guest to check in).
 * Night Tour deliberately does NOT get this treatment — it starts in
 * the evening, long after any reasonable checkout time, so it has no
 * real overlap with a same-day checkout; use overnightSet (or
 * anyBookedSet, for "does this exact date already have any booking at
 * all") for Night Tour instead.
 */
"use client";

import { useEffect, useMemo, useState } from "react";

const EMPTY = [];

export function useBookedDates() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    async function fetchBookedDates() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/bookings/dates");
        const result = await response.json();
        if (isCancelled) return;
        if (!result.success) {
          setError(result.message || "Failed to load availability.");
          return;
        }
        setData(result.data);
      } catch {
        if (!isCancelled) setError("We couldn't reach the server. Check your connection and try again.");
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    fetchBookedDates();
    return () => {
      isCancelled = true;
    };
  }, []);

  const overnightSet = useMemo(() => new Set(data?.overnightBookedDates ?? EMPTY), [data]);
  const dayTourSet = useMemo(() => new Set(data?.dayTourBookedDates ?? EMPTY), [data]);
  const nightTourSet = useMemo(() => new Set(data?.nightTourBookedDates ?? EMPTY), [data]);
  const overnightCheckoutSet = useMemo(() => new Set(data?.overnightCheckoutDates ?? EMPTY), [data]);
  const overnightBlocksDayTourSet = useMemo(() => new Set(data?.overnightBlocksDayTourDates ?? EMPTY), [data]);
  const anyBookedSet = useMemo(
    () => new Set([...overnightSet, ...dayTourSet, ...nightTourSet]),
    [overnightSet, dayTourSet, nightTourSet]
  );

  return {
    isLoading,
    error,
    overnightBookedDates: data?.overnightBookedDates ?? EMPTY,
    dayTourBookedDates: data?.dayTourBookedDates ?? EMPTY,
    nightTourBookedDates: data?.nightTourBookedDates ?? EMPTY,
    overnightSet,
    dayTourSet,
    nightTourSet,
    overnightCheckoutSet,
    overnightBlocksDayTourSet,
    anyBookedSet,
  };
}
