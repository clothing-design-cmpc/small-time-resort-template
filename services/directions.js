/**
 * FILE: services/directions.js
 * PURPOSE:
 * Server-side wrapper around two Google Maps Platform APIs used by the
 * invoice-gated "How to Get There" widget (villa-azure-ai-insight-and-
 * directions-plan.txt, Part 2):
 *   - Geocoding API   — turns a manually-typed address into lat/lng
 *     (only called when the visitor didn't grant browser geolocation)
 *   - Routes API       — deterministic driving directions (distance, ETA,
 *     turn-by-turn steps) from the visitor's location to the resort
 *
 * Destination coordinates come from SystemSettings.resortLatitude/
 * resortLongitude — the same fields already used by the visitor
 * Footer's ResortLocationMap pin (components/shared/ResortLocationMap.jsx),
 * set once by the super-admin under Policies & Content > Contact Info.
 * No separate "directions destination" field needed — it's the same
 * real-world coordinate.
 *
 * Deliberately NOT using Gemini/generative AI for the actual routing —
 * per the plan, directions must be a deterministic API call, never
 * something a language model could hallucinate.
 *
 * Required .env key: GOOGLE_MAPS_API_KEY (server-side only, never
 * NEXT_PUBLIC_ — this key must not be exposed to the browser since it
 * has no per-request quota control the way a public Maps JS key would).
 *
 * Server-side only — never import this in a "use client" file.
 */

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

/**
 * geocodeAddress
 * Converts a free-text address into { latitude, longitude }. Only
 * called as a fallback when the visitor declined browser geolocation
 * (Part 2's cost-control suggestion: default to free device location,
 * manual input is the fallback path).
 *
 * @param {string} address
 * @returns {Promise<{latitude:number, longitude:number}|null>}
 */
export async function geocodeAddress(address) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[directions] GOOGLE_MAPS_API_KEY missing — cannot geocode.");
    return null;
  }

  const url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK" || !data.results?.[0]) {
      return null;
    }

    const { lat, lng } = data.results[0].geometry.location;
    return { latitude: lat, longitude: lng };
  } catch (error) {
    console.error("[directions] Geocoding request failed:", error.message);
    return null;
  }
}

/**
 * computeDrivingRoute
 * Calls the Routes API's computeRoutes endpoint for a driving route
 * between the visitor's location and the resort's fixed destination
 * (SystemSettings.resortLatitude/resortLongitude). Returns a
 * structured summary — distance in meters, duration in seconds, and
 * a human-readable turn-by-turn step list — never raw provider JSON,
 * so the frontend never has to know Google's response shape.
 *
 * @param {object} origin      - { latitude, longitude }
 * @param {object} destination - { latitude, longitude }
 */
export async function computeDrivingRoute(origin, destination) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[directions] GOOGLE_MAPS_API_KEY missing — cannot compute route.");
    return null;
  }

  try {
    const response = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // Field mask keeps the response small and the request cheap —
        // Routes API bills the same regardless, but this avoids pulling
        // fields (like polylines we don't render) we don't need.
        "X-Goog-FieldMask":
          "routes.duration,routes.distanceMeters,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
        destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
    });

    const data = await response.json();

    // Google returns HTTP 200 with an `error` object on failure sometimes,
    // and non-2xx with an error body other times — check both so the real
    // reason (invalid key, Routes API not enabled, billing not enabled,
    // REQUEST_DENIED, etc.) is visible instead of a silent null → 502.
    if (!response.ok || data.error) {
      console.error(
        "[directions] Routes API returned an error:",
        response.status,
        JSON.stringify(data.error ?? data)
      );
      return null;
    }

    const route = data.routes?.[0];
    if (!route) {
      console.error("[directions] Routes API returned no routes:", JSON.stringify(data));
      return null;
    }

    const steps = (route.legs?.[0]?.steps ?? []).map((step) => ({
      instruction: step.navigationInstruction?.instructions ?? "Continue",
      distanceMeters: step.distanceMeters ?? 0,
    }));

    // Routes API returns duration as a string like "1234s"
    const durationSeconds = parseInt(route.duration?.replace("s", ""), 10) || 0;

    return {
      distanceMeters: route.distanceMeters ?? 0,
      durationSeconds,
      steps,
    };
  } catch (error) {
    console.error("[directions] Routes API request failed:", error.message);
    return null;
  }
}