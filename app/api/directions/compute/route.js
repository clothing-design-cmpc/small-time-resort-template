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
 *    expensive one (each call may spend a Geocoding + Routes API call)
 * 3. referenceCode re-verified against Booking (status must be
 *    "confirmed") — a mismatch or cancelled booking returns 403, no
 *    API calls spent
 * 4. checkInDate is also re-checked against getDirectionsAvailability()
 *    on every call — the widget's own "isVerified" state is a UX
 *    convenience only, so a request replayed after verify-reference
 *    passed but before the availability window opened must still be
 *    blocked here, no API calls spent
 * 5. If origin.address was given instead of coordinates, geocode it
 *    first (services/directions.js)
 * 6. Destination is read from SystemSettings.resortLatitude/Longitude
 *    (fixed, set once by the super-admin — never retyped per request)
 * 7. computeDrivingRoute() calls the Routes API and returns distance,
 *    ETA, and turn-by-turn steps
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/services/prisma";
import { checkRateLimit } from "@/services/rateLimit";
import { logSecurityEvent } from "@/services/securityLog";
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
    select: { status: true, checkInDate: true },
  });
  if (!booking || booking.status !== "confirmed") {
    return NextResponse.json(
      { success: false, data: null, message: "Invalid or expired reference code." },
      { status: 403 }
    );
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
  const mapImageDataUrl = mapImageBuffer ? `data:image/png;base64,${mapImageBuffer.toString("base64")}` : null;

  return NextResponse.json({
    success: true,
    data: {
      // encodedPolyline is only ever consumed server-side (by
      // getRouteMapImage() above) — never send it to the client, which
      // gets the already-rendered mapImageDataUrl instead.
      route: { distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, steps: route.steps, mapImageDataUrl },
      origin: originCoords,
      destination,
    },
    message: "Directions calculated.",
  });
}
