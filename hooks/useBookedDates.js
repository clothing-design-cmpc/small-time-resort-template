/**
 * FILE: hooks/useBookedDates.js
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Fetches GET /api/bookings/dates and exposes the per-type booked-date
 * sets as ready-to-use Set objects — same source of truth used by the
 * homepage calendar (HowToBookSection.jsx) and the manual "Book Now"
 * form (BookingFormClient.jsx), so both surfaces agree on which dates
 * are blocked for which booking type.
 *
 * REVALIDATION: previously fetched ONCE on mount only, so the calendar
 * never picked up a booking created, cancelled, or rebooked by ANYONE
 * ELSE (a different visitor, or the super-admin) while this page stayed
 * open — the only workaround was ManageBookingWidget forcing a full
 * page reload after the CURRENT guest's own action. This hook now also
 * silently re-polls in the background on an interval, AND immediately
 * re-fetches whenever the tab regains focus/visibility (covers the
 * common case of a guest tabbing away, finishing a booking or rebook in
 * another tab/device, then tabbing back) — so the calendar catches up
 * to the bookings table on its own without needing a manual reload.
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

import { useCallback, useEffect, useMemo, useState } from "react";

const EMPTY = [];

// How often to silently re-check the bookings table in the background.
// Short enough that a guest sees another visitor's booking/rebook
// within one polling cycle, long enough to never feel like a heavy
// endpoint being hammered by every visitor's browser at once.
const POLL_INTERVAL_MS = 20000;

export function useBookedDates() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * fetchBookedDates
   * @param {boolean} showLoadingState - true for the very first load
   *   (shows the calendar's loading UI); false for background
   *   revalidation, which updates silently and never flips the
   *   calendar back into a loading state or surfaces a transient
   *   network hiccup as a hard error over data guests can already see.
   */
  const fetchBookedDates = useCallback(async (showLoadingState) => {
    if (showLoadingState) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const response = await fetch("/api/bookings/dates");
      const result = await response.json();
      if (!result.success) {
        if (showLoadingState) setError(result.message || "Failed to load availability.");
        return;
      }
      setData(result.data);
      if (showLoadingState) setError(null);
    } catch {
      if (showLoadingState) setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      if (showLoadingState) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    // Initial load — the only one allowed to show the loading state.
    (async () => {
      if (isCancelled) return;
      await fetchBookedDates(true);
    })();

    // Silent background poll — keeps the calendar in sync with bookings
    // made/changed elsewhere (another visitor, the super-admin, or this
    // same guest rebooking in another tab) without any loading flicker.
    const pollId = setInterval(() => {
      if (!isCancelled) fetchBookedDates(false);
    }, POLL_INTERVAL_MS);

    // Immediate catch-up the moment the guest comes back to this tab —
    // don't make them wait out the rest of the poll interval.
    function handleVisibilityChange() {
      if (!isCancelled && document.visibilityState === "visible") {
        fetchBookedDates(false);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCancelled = true;
      clearInterval(pollId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchBookedDates]);

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
