/**
 * FILE: app/superAdmin/(protected)/content/amenities/error.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Catches unhandled errors anywhere under /superAdmin/content/amenities
 * so a failed fetch never crashes the whole admin shell.
 */
"use client";

import "./Amenities.css";

export default function AmenitiesError({ error, reset }) {
  return (
    <section className="amenitiesSection">
      <h1 className="amenitiesTitle">Something went wrong</h1>
      <p>We couldn&apos;t load the Amenities page. Please try again.</p>
      <button type="button" className="amenitiesAddButton" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
