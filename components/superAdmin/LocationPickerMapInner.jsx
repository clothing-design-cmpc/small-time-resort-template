/**
 * FILE: components/superAdmin/LocationPickerMapInner.jsx
 * ROLE: Super-admin — protected by middleware.js auth guard. Browser-only
 *       (imported via next/dynamic with ssr:false from
 *       LocationPickerMap.jsx) — never import this file directly anywhere
 *       else.
 *
 * PURPOSE:
 * Lets the admin set resortLatitude/resortLongitude WITHOUT manually
 * right-clicking Google Maps and copy-pasting coordinates. Three ways
 * to set the pin, all update the same lat/lng:
 *   1. Click anywhere on the map — pin jumps there
 *   2. Drag the existing pin to fine-tune
 *   3. Type an address/place name in the search box and press Enter —
 *      geocoded via OpenStreetMap Nominatim (same no-API-key, no-cost
 *      OSM stack Footer's ResortLocationMapInner.jsx already uses for
 *      tiles), map recenters and the pin moves to the first result
 * A "Use my current location" button is also offered as a shortcut for
 * an admin standing at the resort while setting this up on a phone.
 *
 * DATA FLOW:
 * 1. Receives latitude/longitude (current form values, may be "" or
 *    null before the admin has set anything) + onLocationChange(lat, lng)
 *    from LocationPickerMap.jsx, which got them from PoliciesClient.jsx
 * 2. Any of the 3 interactions above calls onLocationChange(lat, lng) —
 *    PoliciesClient.jsx owns the actual form state, this component
 *    never holds its own separate copy of the "real" value
 * 3. Nominatim search failures (no results, network error) show an
 *    inline message here — never block the map or crash the form
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./LocationPickerMap.css";

// Same Leaflet default-marker-icon fix ResortLocationMapInner.jsx uses —
// Leaflet's bundled icon paths don't resolve correctly through Next.js's
// webpack bundling, so point at Leaflet's own CDN-hosted images instead.
const DEFAULT_MARKER_ICON = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Metro Manila — same placeholder default the schema itself falls back
// to (prisma/schema.prisma resortLatitude/resortLongitude @default),
// so an admin who hasn't set a pin yet still sees a real, navigable map
// instead of an empty/blank one.
const FALLBACK_CENTER = { latitude: 14.5995, longitude: 120.9842 };
const MAP_ZOOM_LEVEL = 15;

/**
 * ClickToSetMarker
 * Invisible helper — react-leaflet's useMapEvents hook only works
 * inside a component rendered as a MapContainer child, so this exists
 * purely to wire the "click anywhere -> move the pin" interaction.
 */
function ClickToSetMarker({ onLocationChange }) {
  useMapEvents({
    click(event) {
      onLocationChange(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

/**
 * RecenterOnChange
 * Leaflet's MapContainer only reads `center` on first mount — without
 * this, searching an address would move the pin but never actually pan
 * the map there. Runs map.setView() any time latitude/longitude change
 * from outside a map interaction (i.e. from a successful search).
 */
function RecenterOnChange({ latitude, longitude }) {
  const map = useMap();
  useEffect(() => {
    if (latitude != null && longitude != null) {
      map.setView([latitude, longitude], map.getZoom());
    }
  }, [latitude, longitude, map]);
  return null;
}

export default function LocationPickerMapInner({ latitude, longitude, onLocationChange }) {
  // Guards against a rare double-init error some Leaflet + React 19
  // Strict Mode combinations hit on fast refresh — same guard
  // ResortLocationMapInner.jsx uses.
  const [isReady, setIsReady] = useState(false);
  useEffect(() => setIsReady(true), []);

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const searchInputRef = useRef(null);

  const hasPin = latitude != null && latitude !== "" && longitude != null && longitude !== "";
  const centerLatitude = hasPin ? Number(latitude) : FALLBACK_CENTER.latitude;
  const centerLongitude = hasPin ? Number(longitude) : FALLBACK_CENTER.longitude;

  /**
   * handleSearchSubmit
   * Geocodes the typed address/place name via OpenStreetMap's free
   * Nominatim API (no key, no cost — same OSM stack the tiles already
   * use) and moves the pin to the first result. A miss or network
   * failure shows an inline message; it never throws or blocks the rest
   * of the form.
   */
  async function handleSearchSubmit(event) {
    event.preventDefault();
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery || isSearching) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmedQuery)}`
      );
      const results = await response.json();

      if (!results || results.length === 0) {
        setSearchError("No matching location found. Try a more specific address.");
        return;
      }

      onLocationChange(Number(results[0].lat), Number(results[0].lon));
    } catch {
      setSearchError("Search failed — check your connection and try again.");
    } finally {
      setIsSearching(false);
    }
  }

  /**
   * handleUseMyLocation
   * Browser Geolocation API shortcut for an admin physically standing
   * at the resort while setting this up on a phone. Requires the
   * admin's own permission grant (standard browser prompt) — never
   * fires without it, and a denial/error just shows an inline message.
   */
  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setSearchError("Your browser doesn't support location access.");
      return;
    }

    setIsLocating(true);
    setSearchError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onLocationChange(position.coords.latitude, position.coords.longitude);
        setIsLocating(false);
      },
      () => {
        setSearchError("Couldn't access your location — check your browser's location permission.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  if (!isReady) {
    return <div className="locationPickerMapSkeleton" aria-hidden="true" />;
  }

  return (
    <div className="locationPickerMap">
      <form className="locationPickerSearchRow" onSubmit={handleSearchSubmit}>
        <input
          ref={searchInputRef}
          type="text"
          className="locationPickerSearchInput"
          placeholder="Search an address or place name…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <button type="submit" className="locationPickerSearchButton" disabled={isSearching}>
          {isSearching ? "Searching…" : "Search"}
        </button>
        <button
          type="button"
          className="locationPickerLocateButton"
          onClick={handleUseMyLocation}
          disabled={isLocating}
        >
          {isLocating ? "Locating…" : "Use my location"}
        </button>
      </form>

      {searchError && <p className="locationPickerError" role="alert">{searchError}</p>}

      <MapContainer
        center={[centerLatitude, centerLongitude]}
        zoom={MAP_ZOOM_LEVEL}
        scrollWheelZoom={true}
        className="locationPickerMapContainer"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickToSetMarker onLocationChange={onLocationChange} />
        <RecenterOnChange latitude={hasPin ? centerLatitude : null} longitude={hasPin ? centerLongitude : null} />
        {hasPin && (
          <Marker
            position={[centerLatitude, centerLongitude]}
            icon={DEFAULT_MARKER_ICON}
            draggable={true}
            eventHandlers={{
              dragend: (event) => {
                const finalPosition = event.target.getLatLng();
                onLocationChange(finalPosition.lat, finalPosition.lng);
              },
            }}
          />
        )}
      </MapContainer>

      <p className="locationPickerHint">
        Click anywhere on the map, drag the pin, search an address above, or use &quot;Use my location&quot; —
        the Latitude/Longitude fields below update automatically.
      </p>
    </div>
  );
}
