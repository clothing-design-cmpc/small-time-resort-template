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
 * 3. geolocateIp() only runs for "action" events, not routine page
 *    views — ip-api.com's free tier is rate-limited (45 req/min), and a
 *    small resort site's page-view volume would burn through that fast
 *    for very little admin value; knowing where a booking came from
 *    matters more than where a page view came from
 */
import { prisma } from "@/services/prisma";

// In-memory cache so the same visitor browsing multiple pages within a
// session doesn't trigger a fresh geolocation lookup every single time.
// Cleared on server restart — fine, since it's just a courtesy cache.
const geoCache = new Map();

const PRIVATE_IP_PATTERNS = [/^127\./, /^10\./, /^192\.168\./, /^::1$/, /^0\.0\.0\.0$/];

function isPrivateOrLocalIp(ip) {
  if (!ip) return true;
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

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
 * Best-effort city/country lookup for a public IP using ip-api.com's
 * free, keyless endpoint. Returns { city: null, country: null } for
 * local/private IPs (always the case in local dev) or on any failure —
 * this must never throw or block the caller.
 */
async function geolocateIp(ipAddress) {
  if (isPrivateOrLocalIp(ipAddress)) return { city: null, country: null };
  if (geoCache.has(ipAddress)) return geoCache.get(ipAddress);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(
      `http://ip-api.com/json/${ipAddress}?fields=status,city,country`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    const result = await response.json();
    const location =
      result?.status === "success"
        ? { city: result.city ?? null, country: result.country ?? null }
        : { city: null, country: null };

    geoCache.set(ipAddress, location);
    return location;
  } catch (error) {
    console.error("[visitorLog] Geolocation lookup failed:", error.message);
    return { city: null, country: null };
  }
}

/**
 * logVisitorActivity
 * @param {object} input
 * @param {Request|null} input.request - incoming Request, for IP/user-agent
 * @param {string} input.action - "page_view" | "booking_submitted"
 * @param {string|null} input.path - page path being visited (page_view events)
 * @param {string|null} input.details - human-readable one-line summary
 * @param {boolean} input.withLocation - whether to run the geo lookup
 *   (skip for high-volume page_view events, run for notable transactions)
 */
export async function logVisitorActivity({
  request = null,
  action = "page_view",
  path = null,
  details = null,
  withLocation = false,
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
