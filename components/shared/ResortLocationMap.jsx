/**
 * FILE: components/shared/ResortLocationMap.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Thin client-side wrapper around the actual Leaflet map. Leaflet
 * reads `window`/`document` at import time, which does not exist
 * during Next.js server rendering — so the real map component
 * (ResortLocationMapInner) is loaded with next/dynamic + ssr:false,
 * which is only allowed inside a "use client" file. Footer.jsx (a
 * Server Component) renders THIS wrapper, never the inner map
 * directly.
 *
 * DATA FLOW:
 * 1. Footer.jsx (Server Component) fetches resortLatitude/Longitude
 *    from the database and passes them down as props here
 * 2. This client component lazy-loads ResortLocationMapInner on the
 *    browser only, passing the same props straight through
 * 3. A lightweight skeleton fills the space while the map chunk loads,
 *    so the footer never has a layout jump once it's actually ready
 */
"use client";

import dynamic from "next/dynamic";
import "./ResortLocationMap.css";

const ResortLocationMapInner = dynamic(() => import("./ResortLocationMapInner"), {
  ssr: false,
  loading: () => <div className="resortLocationMapSkeleton" aria-hidden="true" />,
});

export default function ResortLocationMap({ latitude, longitude, resortName }) {
  return (
    <div className="resortLocationMapWrapper">
      <ResortLocationMapInner latitude={latitude} longitude={longitude} resortName={resortName} />
    </div>
  );
}
