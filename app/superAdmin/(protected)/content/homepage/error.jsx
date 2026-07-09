/**
 * FILE: app/superAdmin/(protected)/content/homepage/error.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Catches unhandled errors anywhere under /superAdmin/content/homepage
 * so a failed fetch never crashes the whole admin shell.
 */
"use client";

import "./Homepage.css";

export default function HomepageError({ error, reset }) {
  return (
    <section className="homepageSection">
      <h1 className="homepageTitle">Something went wrong</h1>
      <p>We couldn&apos;t load the Homepage Customization page. Please try again.</p>
      <button type="button" className="homepageSaveButton" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
