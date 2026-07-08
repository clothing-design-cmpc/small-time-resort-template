/**
 * FILE: app/superAdmin/(protected)/content/rooms/error.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Catches unhandled errors anywhere under /superAdmin/content/rooms so
 * a failed fetch never crashes the whole admin shell.
 */
"use client";

import "./Rooms.css";

export default function RoomsError({ error, reset }) {
  return (
    <section className="roomsSection">
      <h1 className="roomsTitle">Something went wrong</h1>
      <p>We couldn&apos;t load the Rooms page. Please try again.</p>
      <button type="button" className="roomsAddButton" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
