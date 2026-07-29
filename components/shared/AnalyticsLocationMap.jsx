/**
 * FILE: components/shared/AnalyticsLocationMap.jsx
 * ROLE: Super-admin only — used on the Analytics page
 *
 * PURPOSE:
 * Thin client-side wrapper around AnalyticsLocationMapInner, following
 * the exact same pattern as components/shared/ResortLocationMap.jsx:
 * Leaflet reads `window`/`document` at import time, which doesn't
 * exist during Next.js server rendering, so the real map is lazy
 * loaded on the browser only via next/dynamic + ssr:false (only
 * allowed inside a "use client" file). AnalyticsClient.jsx (itself
 * already a Client Component) renders THIS wrapper, never the inner
 * map directly.
 *
 * DATA FLOW:
 * 1. AnalyticsClient.jsx passes the fetched locationBreakdown rows
 *    down as the `locations` prop
 * 2. This client component lazy-loads AnalyticsLocationMapInner on the
 *    browser only, passing the same prop straight through
 * 3. A lightweight skeleton fills the space while the map chunk loads,
 *    so the panel never jumps once the map is actually ready
 */
"use client";

import dynamic from "next/dynamic";
import "./AnalyticsLocationMap.css";

const AnalyticsLocationMapInner = dynamic(() => import("./AnalyticsLocationMapInner"), {
  ssr: false,
  loading: () => <div className="analyticsLocationMapSkeleton" aria-hidden="true" />,
});

export default function AnalyticsLocationMap({ locations }) {
  return (
    <div className="analyticsLocationMapWrapper">
      <AnalyticsLocationMapInner locations={locations} />
    </div>
  );
}
