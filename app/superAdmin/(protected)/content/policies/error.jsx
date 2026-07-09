/**
 * FILE: app/superAdmin/(protected)/content/policies/error.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Catches unhandled errors anywhere under /superAdmin/content/policies
 * so a failed fetch never crashes the whole admin shell.
 */
"use client";

import "./Policies.css";

export default function PoliciesError({ error, reset }) {
  return (
    <section className="policiesSection">
      <h1 className="policiesTitle">Something went wrong</h1>
      <p>We couldn&apos;t load the Policies page. Please try again.</p>
      <button type="button" className="policiesSaveButton" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
