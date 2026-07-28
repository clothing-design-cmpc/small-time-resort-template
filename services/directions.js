/**
 * FILE: services/directions.js
 * PURPOSE:
 * Server-side wrapper around three Google Maps Platform APIs used by
 * the invoice-gated "How to Get There" widget (villa-azure-ai-insight-
 * and-directions-plan.txt, Part 2):
 *   - Geocoding API   — turns a manually-typed address into lat/lng
 *     (only called when the visitor didn't grant browser geolocation)
 *   - Routes API       — deterministic driving directions (distance, ETA,
 *     turn-by-turn steps) from the visitor's location to the resort
 *   - Static Maps API  — renders a plain PNG image (no JS map, no
 *     client-side key exposure) for two separate uses:
 *       1. getRouteMapImage() — the guest's actual route, drawn from
 *          the polyline Routes API already returns, shown on the
 *          gated /visitor/directions page
 *       2. getResortLocationMapImage() — a plain pin at the resort's
 *          coordinates only (no route — the guest's origin isn't known
 *          yet at invoice time), embedded in the booking invoice PDF
 *          by services/invoicePdf.js
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
 * Static Maps API images are fetched here and streamed back to the
 * client as base64/PNG bytes — the key itself never reaches the browser.
 *
 * Server-side only — never import this in a "use client" file.
 */

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";

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
        // fields we don't need. routes.polyline.encodedPolyline IS
        // requested — it's what lets getRouteMapImage() draw the actual
        // route line on the Static Maps image below, instead of just
        // two disconnected pins.
        "X-Goog-FieldMask":
          "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters",
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
      // Google's encoded polyline algorithm format — only ever consumed
      // server-side by getRouteMapImage() below, never sent as-is to
      // the client (the client gets a rendered PNG image instead).
      encodedPolyline: route.polyline?.encodedPolyline ?? null,
    };
  } catch (error) {
    console.error("[directions] Routes API request failed:", error.message);
    return null;
  }
}

/**
 * getRouteMapImage
 * Renders a Static Maps API PNG showing the visitor's actual driving
 * route — an "A" pin at their location, a "B" pin at the resort, and
 * the real route path drawn from computeDrivingRoute()'s encoded
 * polyline. Fetched and returned as raw PNG bytes here so the caller
 * (app/api/directions/compute/route.js) can hand the browser a plain
 * image with the API key never leaving the server.
 *
 * @param {object} origin           - { latitude, longitude }
 * @param {object} destination      - { latitude, longitude }
 * @param {string|null} encodedPolyline - from computeDrivingRoute()'s
 *   return value; if null, the map still renders with just the two
 *   pins (better than no map at all)
 * @returns {Promise<Buffer|null>}
 */
export async function getRouteMapImage(origin, destination, encodedPolyline) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[directions] GOOGLE_MAPS_API_KEY missing — cannot fetch route map image.");
    return null;
  }

  const params = new URLSearchParams({
    size: "640x400",
    scale: "2", // retina-sharp — renders at 1280x800 actual pixels
    key: apiKey,
  });
  params.append("markers", `color:blue|label:A|${origin.latitude},${origin.longitude}`);
  params.append("markers", `color:green|label:B|${destination.latitude},${destination.longitude}`);
  if (encodedPolyline) {
    params.append("path", `color:0x1c8b2bff|weight:4|enc:${encodedPolyline}`);
  }

  try {
    const response = await fetch(`${STATIC_MAP_URL}?${params.toString()}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[directions] Static Maps API returned an error:", response.status, errorText);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error("[directions] Static Maps API request failed:", error.message);
    return null;
  }
}

/**
 * getResortLocationMapImage
 * Renders a plain Static Maps API PNG with a single pin at the
 * resort's coordinates — no route, since the guest's origin isn't
 * known yet at the point this is used (booking invoice generation,
 * services/invoicePdf.js). This is a location reference only; the
 * personalized route map comes later from getRouteMapImage() once the
 * guest visits the gated /visitor/directions page.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Buffer|null>}
 */
export async function getResortLocationMapImage(latitude, longitude) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[directions] GOOGLE_MAPS_API_KEY missing — cannot fetch resort location map image.");
    return null;
  }

  const params = new URLSearchParams({
    center: `${latitude},${longitude}`,
    zoom: "15",
    size: "480x320",
    scale: "2", // retina-sharp for print quality inside the PDF
    markers: `color:green|${latitude},${longitude}`,
    key: apiKey,
  });

  try {
    const response = await fetch(`${STATIC_MAP_URL}?${params.toString()}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[directions] Static Maps API returned an error:", response.status, errorText);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error("[directions] Static Maps API request failed:", error.message);
    return null;
  }
}