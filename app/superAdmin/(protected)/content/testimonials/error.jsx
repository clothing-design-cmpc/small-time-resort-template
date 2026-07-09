/**
 * FILE: app/superAdmin/(protected)/content/testimonials/error.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Catches unhandled errors anywhere under /superAdmin/content/testimonials
 * so a failed fetch never crashes the whole admin shell.
 */
"use client";

import "./Testimonials.css";

export default function TestimonialsError({ error, reset }) {
  return (
    <section className="testimonialsSection">
      <h1 className="testimonialsTitle">Something went wrong</h1>
      <p>We couldn&apos;t load the Testimonials page. Please try again.</p>
      <button type="button" className="testimonialsAddButton" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
