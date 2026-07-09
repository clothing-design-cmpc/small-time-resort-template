/**
 * FILE: app/superAdmin/(protected)/content/gallery/error.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Catches unhandled errors anywhere under /superAdmin/content/gallery
 * so a failed fetch never crashes the whole admin shell.
 */
"use client";

import "./Gallery.css";

export default function GalleryError({ error, reset }) {
  return (
    <section className="gallerySection">
      <h1 className="galleryTitle">Something went wrong</h1>
      <p>We couldn&apos;t load the Gallery page. Please try again.</p>
      <button type="button" className="galleryAddButton" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
