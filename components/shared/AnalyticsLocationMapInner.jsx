/**
 * FILE: components/shared/AnalyticsLocationMapInner.jsx
 * ROLE: Super-admin only — rendered inside the Analytics page
 * (app/superAdmin/(protected)/analytics). Browser-only (imported via
 * next/dynamic with ssr:false from AnalyticsLocationMap.jsx) — never
 * import this file directly anywhere else, same rule as
 * ResortLocationMapInner.jsx.
 *
 * PURPOSE:
 * Renders an interactive Leaflet map centered on the Philippines with
 * one colored, sized circle marker per resolvable Top Location row.
 * Marker radius and color intensity both scale with that location's
 * share of the highest view count, so an admin can see at a glance
 * which cities are driving the most traffic — a heatmap-style read
 * without needing an actual heatmap tile layer.
 *
 * DATA FLOW:
 * 1. Receives `locations` (the same locationBreakdown rows already
 *    fetched by AnalyticsClient.jsx: { city, countryCode, views })
 *    from AnalyticsLocationMap.jsx
 * 2. Each row is resolved to a [lat, lng] pair via
 *    utils/philippineCityCoordinates.js — rows that can't be resolved
 *    are skipped on the map (they still show in the ranked list panel)
 * 3. Renders one CircleMarker per resolved row, sized/colored by views,
 *    with a Popup showing the exact city, country, and view count
 */
"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  getCityCoordinates,
  PHILIPPINES_MAP_CENTER,
  PHILIPPINES_MAP_DEFAULT_ZOOM,
} from "@/utils/philippineCityCoordinates";

// Single accent-green family, light-to-dark by intensity — matches
// Rule 17.2 ("no rainbow/multicolor, one accent family only") and the
// same palette already used for charts elsewhere on this page.
const INTENSITY_COLOR_STOPS = ["#166534", "#22c55e", "#4ade80", "#86efac"];

const MIN_MARKER_RADIUS = 8;
const MAX_MARKER_RADIUS = 28;

/**
 * getMarkerStyle
 * Scales a marker's radius and fill color by its view count relative
 * to the highest view count on the map, so the busiest city is always
 * the largest, darkest-accent dot regardless of the absolute numbers.
 */
function getMarkerStyle(views, maxViews) {
  const ratio = maxViews > 0 ? views / maxViews : 0;
  const radius = MIN_MARKER_RADIUS + ratio * (MAX_MARKER_RADIUS - MIN_MARKER_RADIUS);

  const stopIndex = Math.min(
    INTENSITY_COLOR_STOPS.length - 1,
    Math.floor(ratio * (INTENSITY_COLOR_STOPS.length - 1))
  );

  return { radius, color: INTENSITY_COLOR_STOPS[stopIndex] };
}

export default function AnalyticsLocationMapInner({ locations }) {
  // Guards against the same Leaflet + React 19 Strict Mode double-init
  // issue handled in ResortLocationMapInner.jsx — mount only once the
  // component has settled instead of on first render.
  const [isReady, setIsReady] = useState(false);
  useEffect(() => setIsReady(true), []);

  if (!isReady) {
    return <div className="analyticsLocationMapSkeleton" aria-hidden="true" />;
  }

  // Resolve each row to a plottable point; rows with no known
  // coordinates are dropped here but remain visible in the ranked
  // list panel that sits below the map.
  const plottablePoints = (locations ?? [])
    .map((row) => {
      const coordinates = getCityCoordinates(row.city, row.countryCode);
      return coordinates ? { ...row, coordinates } : null;
    })
    .filter(Boolean);

  const maxViews = plottablePoints.reduce((max, row) => Math.max(max, row.views), 0);

  return (
    <MapContainer
      center={PHILIPPINES_MAP_CENTER}
      zoom={PHILIPPINES_MAP_DEFAULT_ZOOM}
      scrollWheelZoom={true}
      className="analyticsLocationMapContainer"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {plottablePoints.map((row) => {
        const { radius, color } = getMarkerStyle(row.views, maxViews);
        return (
          <CircleMarker
            key={`${row.city}-${row.countryCode}`}
            center={row.coordinates}
            radius={radius}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.6, weight: 1 }}
          >
            <Popup>
              {row.city}, {row.countryCode} — {row.views.toLocaleString()} views
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
