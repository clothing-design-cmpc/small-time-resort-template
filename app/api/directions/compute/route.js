/**
 * FILE: app/api/directions/compute/route.js
 * ROLE: Public — no auth required, but GATED by a valid booking
 *       reference code (villa-azure-ai-insight-and-directions-plan.txt,
 *       Part 2, step 5-6)
 *
 * PURPOSE:
 * Computes real driving directions from the visitor's location to the
 * resort, but ONLY after re-verifying the supplied referenceCode
 * server-side — this route never trusts a "already verified" flag from
 * the client, since that would let anyone skip the gate by editing
 * client-side state. Every call here re-checks the code against the DB,
 * which is also what keeps Directions/Geocoding API cost bounded to
 * people who actually have a real booking (the plan's whole reason for
 * gating this feature in the first place).
 *
 * DATA FLOW:
 * 1. DirectionsClient POSTs { referenceCode, origin } where origin is
 *    either { latitude, longitude } (from browser geolocation) or
 *    { address } (manual text input)
 * 2. Rate limited same as verify-reference — this endpoint is the
 *    expensive one on a cache miss (each call may spend a Geocoding +
 *    Routes + Static Maps API call)
 * 3. referenceCode re-verified against Booking (status must be
 *    "confirmed") — a mismatch or cancelled booking returns 403, no
 *    API calls spent
 * 4. CACHE CHECK — if directionsRouteData is already saved on this
 *    booking (i.e. a previous call already paid for the Geocoding/
 *    Routes/Static Maps calls), that saved JSON + the R2 map image URL
 *    are returned immediately. No Google Maps API of any kind is
 *    called on a cache hit — the guest can reopen this page and click
 *    "Get Directions" as many times as they want after the first
 *    successful compute, at zero additional API cost.
 * 5. CACHE MISS (first time only) — checkInDate is checked against
 *    getDirectionsAvailability(); if origin.address was given instead
 *    of coordinates, it's geocoded; computeDrivingRoute() calls the
 *    Routes API; getRouteMapImage() calls Static Maps and the PNG is
 *    uploaded to Cloudflare R2 (Rule 35.6) instead of being streamed
 *    back as base64 — both the route JSON and the R2 URL are saved to
 *    the Booking row so every future call for this reference code is
 *    a cache hit (step 4)
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/services/prisma";
import { checkRateLimit } from "@/services/rateLimit";
import { logSecurityEvent } from "@/services/securityLog";
import { uploadToR2 } from "@/services/r2";
import { geocodeAddress, computeDrivingRoute, getRouteMapImage, getDirectionsAvailability } from "@/services/directions";

const COMPUTE_MAX_ATTEMPTS = 10;
const COMPUTE_WINDOW_MS = 15 * 60 * 1000;

const computeSchema = z.object({
  referenceCode: z.string().trim().min(1).max(40),
  origin: z.union([
    z.object({ latitude: z.coerce.number(), longitude: z.coerce.number() }),
    z.object({ address: z.string().trim().min(3).max(200) }),
  ]),
});

/**
 * buildGoogleMapsUrl
 * Deep-link into Google Maps' own app/website with the origin and
 * destination pre-filled — NOT an embedded map, just a URL. Opening
 * this costs nothing: no Maps JavaScript API key, no "map load"
 * billing, no server call at all. This is the free alternative to an
 * embedded interactive map (Maps JavaScript API bills per load, which
 * would reintroduce a per-view cost the caching in this route was
 * built specifically to avoid).
 */
function buildGoogleMapsUrl(originLat, originLng, destLat, destLng) {
  const params = new URLSearchParams({
    api: "1",
    origin: `${originLat},${originLng}`,
    destination: `${destLat},${destLng}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkRateLimit(`directions-compute:${ip}`, COMPUTE_MAX_ATTEMPTS, COMPUTE_WINDOW_MS);
  if (!allowed) {
    await logSecurityEvent({
      eventType: "rate_limit_hit",
      actor: null,
      request,
      details: `Exceeded ${COMPUTE_MAX_ATTEMPTS} directions requests within 15 minutes.`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Too many requests. Please try again in a bit." },
      { status: 429 }
    );
  }

  let payload;
  try {
    payload = computeSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Please provide your location and reference code." },
      { status: 400 }
    );
  }

  // Re-verify the gate on every single call — never trust a client-side
  // "already verified" flag (see file header).
  const booking = await prisma.booking.findUnique({
    where: { referenceCode: payload.referenceCode.toUpperCase() },
    select: {
      id: true,
      guestName: true,
      status: true,
      checkInDate: true,
      directionsAccessedAt: true,
      directionsRouteData: true,
      directionsMapImageUrl: true,
    },
  });
  if (!booking || booking.status !== "confirmed") {
    return NextResponse.json(
      { success: false, data: null, message: "Invalid or expired reference code." },
      { status: 403 }
    );
  }

  // CACHE HIT — directions were already computed once for this
  // booking. Serve the saved snapshot straight from the DB + R2's CDN;
  // no Geocoding/Routes/Static Maps call is made, so this costs
  // nothing no matter how many times (or from how many devices) the
  // guest reopens this page. The guest's freshly-submitted origin is
  // intentionally ignored here — the cached route is a snapshot of
  // wherever they were on first use, not a live re-route.
  if (booking.directionsAccessedAt && booking.directionsRouteData) {
    // destinationLatitude/Longitude were only added to the snapshot
    // starting with this update — older cached bookings won't have
    // them, so fall back to the current SystemSettings value. This is
    // a plain Postgres read, not a paid Google API call, so it's still
    // free on every cache-hit view.
    let cachedDestLat = booking.directionsRouteData.destinationLatitude;
    let cachedDestLng = booking.directionsRouteData.destinationLongitude;
    if (cachedDestLat == null || cachedDestLng == null) {
      const settings = await prisma.systemSettings.findUnique({
        where: { id: "singleton" },
        select: { resortLatitude: true, resortLongitude: true },
      });
      cachedDestLat = settings?.resortLatitude ?? null;
      cachedDestLng = settings?.resortLongitude ?? null;
    }

    await logSecurityEvent({
      eventType: "directions_reaccessed",
      actor: booking.guestName,
      request,
      details: `Served cached directions (first computed ${booking.directionsAccessedAt.toISOString()}) — no API call made.`,
    });
    return NextResponse.json({
      success: true,
      data: {
        route: {
          ...booking.directionsRouteData,
          mapImageUrl: booking.directionsMapImageUrl ?? null,
          googleMapsUrl:
            cachedDestLat != null && cachedDestLng != null
              ? buildGoogleMapsUrl(
                  booking.directionsRouteData.originLatitude,
                  booking.directionsRouteData.originLongitude,
                  cachedDestLat,
                  cachedDestLng
                )
              : null,
          cached: true,
        },
      },
      message: "Directions retrieved from your first request.",
    });
  }

  // Same availability window as verify-reference, re-checked here since
  // this is the route that actually spends Geocoding/Routes API calls —
  // blocks a request replayed after the reference code passed but
  // before the 1-day-before-check-in window opened.
  const { available, availableFrom } = getDirectionsAvailability(booking.checkInDate);
  if (!available) {
    await logSecurityEvent({
      eventType: "directions_denied_early",
      actor: null,
      request,
      details: `Directions compute blocked — available starting ${availableFrom.toISOString().slice(0, 10)}.`,
    });
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: `Directions open starting ${availableFrom.toISOString().slice(0, 10)} — please check back closer to your visit.`,
      },
      { status: 403 }
    );
  }

  const settings = await prisma.systemSettings.findUnique({
    where: { id: "singleton" },
    select: { resortLatitude: true, resortLongitude: true },
  });
  if (!settings?.resortLatitude || !settings?.resortLongitude) {
    return NextResponse.json(
      { success: false, data: null, message: "Directions are not available right now. Please contact us directly." },
      { status: 503 }
    );
  }
  const destination = { latitude: settings.resortLatitude, longitude: settings.resortLongitude };

  // Resolve origin coordinates — geocode only if a manual address was given.
  let originCoords;
  if ("address" in payload.origin) {
    originCoords = await geocodeAddress(payload.origin.address);
    if (!originCoords) {
      return NextResponse.json(
        { success: false, data: null, message: "We couldn't find that address. Please try a more specific location." },
        { status: 400 }
      );
    }
  } else {
    originCoords = payload.origin;
  }

  const route = await computeDrivingRoute(originCoords, destination);
  if (!route) {
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't calculate directions right now. Please try again." },
      { status: 502 }
    );
  }

  // Render a Static Maps image of the actual route — a missing/failed
  // image should never block the turn-by-turn directions that already
  // succeeded above, so this degrades to null (no map, list still shows).
  const mapImageBuffer = await getRouteMapImage(originCoords, destination, route.encodedPolyline);

  // Upload once to Cloudflare R2 (Rule 35.6/35.8 — "directions/" folder)
  // instead of streaming base64 back on every request. Every future
  // view of this booking's directions loads this same CDN URL directly
  // — no Static Maps call is ever repeated for this booking.
  let mapImageUrl = null;
  let mapImageKey = null;
  if (mapImageBuffer) {
    try {
      mapImageKey = `directions/${booking.id}.png`;
      mapImageUrl = await uploadToR2(mapImageKey, mapImageBuffer, "image/png");
    } catch (error) {
      // A failed R2 upload should never block the turn-by-turn list
      // that already succeeded above — degrade to no map, same as a
      // failed Static Maps call would.
      console.error("[directions/compute] R2 upload failed:", error.message);
      mapImageKey = null;
    }
  }

  // Snapshot saved once — never recomputed from this JSON later, it's
  // read-only from here on (see schema.prisma field comments).
  // destinationLatitude/Longitude are stored alongside origin so the
  // free "Open in Google Maps" deep-link can be rebuilt on every
  // cache-hit view without a settings lookup.
  const routeSnapshot = {
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    steps: route.steps,
    originLatitude: originCoords.latitude,
    originLongitude: originCoords.longitude,
    destinationLatitude: destination.latitude,
    destinationLongitude: destination.longitude,
  };

  // Route successfully computed — mark this booking's directions as
  // used and save the snapshot so every later call is a cache hit
  // (see the CACHE HIT branch above), and log this device's IP/
  // location/fingerprint against the booking, same reasoning as
  // verify-reference's success log: an admin should be able to see WHO
  // actually pulled turn-by-turn directions to the resort, not just
  // who got rate-limited or denied.
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      directionsAccessedAt: new Date(),
      directionsRouteData: routeSnapshot,
      directionsMapImageUrl: mapImageUrl,
      directionsMapImageKey: mapImageKey,
    },
  });
  await logSecurityEvent({
    eventType: "directions_accessed",
    actor: booking.guestName,
    request,
    details: `Directions computed (${(route.distanceMeters / 1000).toFixed(1)}km, ${Math.round(route.durationSeconds / 60)}min) — cached for future views.`,
  });

  return NextResponse.json({
    success: true,
    data: {
      // encodedPolyline is only ever consumed server-side (by
      // getRouteMapImage() above) — never sent to the client, which
      // gets the R2 CDN URL instead. googleMapsUrl is a free deep-link
      // (no API cost) so the guest can open turn-by-turn navigation in
      // their own Google Maps app if they want a live, pannable map.
      route: {
        ...routeSnapshot,
        mapImageUrl,
        googleMapsUrl: buildGoogleMapsUrl(originCoords.latitude, originCoords.longitude, destination.latitude, destination.longitude),
        cached: false,
      },
    },
    message: "Directions calculated.",
  });
}
