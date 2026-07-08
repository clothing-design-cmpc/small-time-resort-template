/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/error.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Catches unhandled errors anywhere under /superAdmin/settings/
 * booking-rules so a failed fetch never crashes the whole admin shell.
 */
"use client";

import "./BookingRules.css";

export default function BookingRulesError({ error, reset }) {
  return (
    <section className="bookingRulesPage">
      <h1 className="bookingRulesPageTitle">Something went wrong</h1>
      <p>We couldn&apos;t load the Booking Rules page. Please try again.</p>
      <button type="button" className="bookingRulesAddButton" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
