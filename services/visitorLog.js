/**
 * FILE: services/visitorLog.js
 * PURPOSE:
 * Writes one row to VisitorLog per tracked visitor event — either a
 * routine page view or a notable transaction (e.g. submitting a
 * booking). Also does a best-effort IP -> city/country lookup so the
 * super-admin Visitor Logs page can show roughly where traffic is
 * coming from. Logging must NEVER break the request it's attached to —
 * every call is wrapped in try/catch and failures only console.error,
 * never re-thrown.
 *
 * DATA FLOW:
 * 1. middleware.js fires a page_view for every visitor page request
 *    (via a non-blocking POST to app/api/visitor-log/track/route.js,
 *    since Edge middleware cannot reach Prisma directly)
 * 2. Route handlers for notable actions (e.g. app/api/bookings/route.js)
 *    call logVisitorActivity() directly after the outcome is known
 * 3. geolocateIp() now runs for every event, page views included. This
 *    used to skip page views on purpose because the old lookup went
 *    out to ip-api.com's free tier (rate-limited to 45 req/min, and a
 *    plain-HTTP call leaking every visitor's IP to a third party). Now
 *    that it reads the self-hosted MaxMind DB (services/geoip.js — the
 *    same source already fixed for Security Logs, Rule 38.5) there's
 *    no external call, no rate limit, and no reason left to leave page
 *    views without a location.
 */
import { lookupGeoLocation } from "@/services/geoip";
import { prisma } from "@/services/prisma";

/**
 * getRequestMeta
 * Pulls the caller's IP (from x-forwarded-for, since the app sits
 * behind a proxy in most deployments) and user-agent off the Request.
 */
function getRequestMeta(request) {
  const ipAddress = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request?.headers?.get("user-agent") ?? null;
  return { ipAddress, userAgent };
}

/**
 * geolocateIp
 * Best-effort city/country lookup for a public IP via the self-hosted
 * MaxMind DB. lookupGeoLocation() already returns nulls for
 * private/loopback IPs and on any failure — this must never throw or
 * block the caller either way.
 */
async function geolocateIp(ipAddress) {
  const location = await lookupGeoLocation(ipAddress);
  return { city: location.city, country: location.countryCode };
}

/**
 * logVisitorActivity
 * @param {object} input
 * @param {Request|null} input.request - incoming Request, for IP/user-agent
 * @param {string} input.action - "page_view" | "booking_submitted"
 * @param {string|null} input.path - page path being visited (page_view events)
 * @param {string|null} input.details - human-readable one-line summary
 * @param {boolean} input.withLocation - whether to run the geo lookup.
 *   Defaults to true now that lookupGeoLocation() is a free, local,
 *   no-rate-limit MaxMind read — kept as an opt-out, not an opt-in, in
 *   case a future caller ever needs to skip it for its own reason.
 */
export async function logVisitorActivity({
  request = null,
  action = "page_view",
  path = null,
  details = null,
  withLocation = true,
}) {
  const { ipAddress, userAgent } = getRequestMeta(request);
  const { city, country } = withLocation
    ? await geolocateIp(ipAddress)
    : { city: null, country: null };

  try {
    await prisma.visitorLog.create({
      data: { ipAddress, userAgent, path, action, details, city, country },
    });
  } catch (error) {
    console.error("[visitorLog] Failed to write visitor log:", error.message);
  }
}
