/**
 * FILE: app/superAdmin/(protected)/content/booking-confirmation-email/error.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Catches unhandled errors anywhere under
 * /superAdmin/content/booking-confirmation-email so a failed fetch
 * never crashes the whole admin shell.
 */
"use client";

import "./BookingConfirmationEmail.css";

export default function BookingConfirmationEmailError({ error, reset }) {
  return (
    <section className="bceSection">
      <h1 className="bceTitle">Something went wrong</h1>
      <p>We couldn&apos;t load the Booking Confirmation Email page. Please try again.</p>
      <button type="button" className="bceSaveButton" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
