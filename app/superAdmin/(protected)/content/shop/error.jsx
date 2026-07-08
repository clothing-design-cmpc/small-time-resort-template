/**
 * FILE: app/superAdmin/(protected)/content/shop/error.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Catches unhandled errors anywhere under /superAdmin/content/shop so
 * a failed fetch never crashes the whole admin shell.
 */
"use client";

import "./Shop.css";

export default function ShopError({ error, reset }) {
  return (
    <section className="shopSection">
      <h1 className="shopTitle">Something went wrong</h1>
      <p>We couldn&apos;t load the Resort Shop page. Please try again.</p>
      <button type="button" className="shopAddButton" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
