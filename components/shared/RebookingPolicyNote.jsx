/**
 * FILE: components/shared/RebookingPolicyNote.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Small note shown on a booking confirmation screen explaining the
 * resort's current rebooking policy (how many times this booking can
 * be moved to new dates, and what happens once that limit is
 * reached) — the exact wording a super-admin configured under
 * Settings > Booking Rules > Section 7, so the guest sees the same
 * policy here as on /visitor/policies.
 *
 * DATA FLOW:
 * 1. Fetches GET /api/booking-rules/rebooking-policy on mount (public,
 *    read-only — see that route's file header)
 * 2. Renders nothing while loading or on failure — this is a nice-to-
 *    have note, never something worth blocking or degrading the
 *    confirmation screen over
 */
"use client";

import { useEffect, useState } from "react";

export default function RebookingPolicyNote() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/booking-rules/rebooking-policy")
      .then((response) => response.json())
      .then((result) => {
        if (isMounted && result.success) setSummary(result.data);
      })
      .catch(() => {
        /* Best-effort only — the confirmation screen works fine without this note */
      });
    return () => {
      isMounted = false;
    };
  }, []);

  if (!summary) return null;

  return (
    <p className="bookingConfirmPolicyNote">
      <strong>{summary.title}:</strong> {summary.body}
    </p>
  );
}
