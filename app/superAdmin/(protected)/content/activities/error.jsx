/**
 * FILE: app/superAdmin/(protected)/content/activities/error.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Catches unhandled errors anywhere under /superAdmin/content/activities
 * so a failed fetch never crashes the whole admin shell.
 */
"use client";

import "./Activities.css";

export default function ActivitiesError({ error, reset }) {
  return (
    <section className="activitiesSection">
      <h1 className="activitiesTitle">Something went wrong</h1>
      <p>We couldn&apos;t load the Activities page. Please try again.</p>
      <button type="button" className="activitiesAddButton" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
