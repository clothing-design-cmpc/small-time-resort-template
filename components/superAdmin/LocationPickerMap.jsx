/**
 * FILE: components/superAdmin/LocationPickerMap.jsx
 * ROLE: Super-admin — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Thin client-side wrapper around the actual interactive Leaflet
 * picker. Leaflet reads `window`/`document` at import time, which does
 * not exist during Next.js server rendering — so the real map
 * component (LocationPickerMapInner) is loaded with next/dynamic +
 * ssr:false, same pattern components/shared/ResortLocationMap.jsx
 * already uses for the read-only visitor-facing map.
 *
 * DATA FLOW:
 * 1. PoliciesClient.jsx (Contact Info tab) renders this with the
 *    current resortLatitude/resortLongitude form values + an
 *    onLocationChange(lat, lng) callback
 * 2. This client component lazy-loads LocationPickerMapInner on the
 *    browser only, passing the same props straight through
 * 3. A lightweight skeleton fills the space while the map chunk loads,
 *    so the form never has a layout jump once it's actually ready
 */
"use client";

import dynamic from "next/dynamic";
import "./LocationPickerMap.css";

const LocationPickerMapInner = dynamic(() => import("./LocationPickerMapInner"), {
  ssr: false,
  loading: () => <div className="locationPickerMapSkeleton" aria-hidden="true" />,
});

export default function LocationPickerMap({ latitude, longitude, onLocationChange }) {
  return (
    <div className="locationPickerMapWrapper">
      <LocationPickerMapInner latitude={latitude} longitude={longitude} onLocationChange={onLocationChange} />
    </div>
  );
}
