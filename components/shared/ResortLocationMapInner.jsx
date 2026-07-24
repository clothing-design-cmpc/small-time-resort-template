/**
 * FILE: components/shared/ResortLocationMapInner.jsx
 * ROLE: Visitor — public, no auth required. Browser-only (imported via
 *       next/dynamic with ssr:false from ResortLocationMap.jsx) — never
 *       import this file directly anywhere else.
 *
 * PURPOSE:
 * Renders a small, non-interactive-feeling Leaflet map (OpenStreetMap
 * tiles, no API key required) with a single pin at the resort's
 * coordinates. Scroll-wheel zoom is disabled so scrolling the footer
 * doesn't accidentally zoom the map — visitors can still drag/pan and
 * use the +/- buttons.
 *
 * DATA FLOW:
 * 1. Receives latitude/longitude/resortName as props from
 *    ResortLocationMap.jsx, which got them from Footer.jsx
 * 2. Renders a MapContainer centered on those coordinates with one
 *    Marker + Popup showing the resort name
 */
"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet's default marker icon references image paths that don't
// resolve correctly once bundled by Next.js/webpack — this is the
// standard fix: point the default icon at Leaflet's own CDN-hosted
// images instead of trying to bundle them locally.
const DEFAULT_MARKER_ICON = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const MAP_ZOOM_LEVEL = 15;

export default function ResortLocationMapInner({ latitude, longitude, resortName }) {
  // Guards against a rare double-init error some Leaflet + React 19
  // Strict Mode combinations hit on fast refresh — mounting only after
  // the component has settled avoids re-creating the map on the same
  // container node.
  const [isReady, setIsReady] = useState(false);
  useEffect(() => setIsReady(true), []);

  if (!isReady || latitude == null || longitude == null) {
    return <div className="resortLocationMapSkeleton" aria-hidden="true" />;
  }

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={MAP_ZOOM_LEVEL}
      scrollWheelZoom={false}
      className="resortLocationMapContainer"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[latitude, longitude]} icon={DEFAULT_MARKER_ICON}>
        <Popup>{resortName}</Popup>
      </Marker>
    </MapContainer>
  );
}
