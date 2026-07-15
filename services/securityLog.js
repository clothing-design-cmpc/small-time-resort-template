/**
 * FILE: services/securityLog.js
 * PURPOSE:
 * Writes one row to SecurityLog for every security-relevant event
 * (login success/failure, denied admin access, rate limit hits,
 * sensitive admin actions). Logging must NEVER break the request it's
 * attached to — every call is wrapped in try/catch and failures are
 * only console.error'd, never re-thrown, so a DB hiccup on the log
 * write can't turn into a failed login or a failed booking.
 *
 * Beyond the base event fields, every write is enriched with:
 *   - Device info (deviceType/browserName/osName) parsed from the UA
 *   - A device fingerprint, compared against the actor's last known
 *     fingerprint to flag isNewDevice
 *   - Geolocation (country/city/lat/long) via self-hosted MaxMind
 *     GeoIP2 (services/geoip.js)
 *   - Anomaly detection: flags isAnomalous + anomalyReason when a
 *     login implies impossible travel (too far, too fast since the
 *     actor's last successful login) or comes from a brand-new device
 *
 * DATA FLOW:
 * 1. A route handler (login, rate-limited routes, admin mutation
 *    routes) calls logSecurityEvent() after the outcome is known
 * 2. IP/user-agent are read straight off the incoming Request here so
 *    every call site doesn't have to repeat that extraction logic
 * 3. For login_success events only, this queries the actor's most
 *    recent prior row to run anomaly detection before writing the new one
 */
import { prisma } from "@/services/prisma";
import { parseDeviceInfo, generateDeviceFingerprint } from "@/services/deviceFingerprint";
import { lookupGeoLocation, haversineDistanceKm } from "@/services/geoip";

// Anomaly detection only makes sense for events that represent a real,
// successful session start — flagging every failed attempt as
// "impossible travel" would just be noise (failed logins from many
// locations are expected, e.g. credential-stuffing attempts).
const ANOMALY_ELIGIBLE_EVENT_TYPES = new Set(["login_success"]);

// A login is only flagged as impossible travel if the implied speed
// exceeds commercial air travel by a wide margin — this avoids false
// positives from a guest genuinely flying somewhere and logging in
// again shortly after landing.
const IMPOSSIBLE_TRAVEL_SPEED_KMH = 900;

/**
 * getRequestMeta
 * Pulls the caller's IP and user-agent off the Request object.
 *
 * Checks x-forwarded-for first (the standard header set by most
 * reverse proxies/load balancers, e.g. Vercel, Nginx), then falls back
 * to cf-connecting-ip (Cloudflare) and x-real-ip (Nginx's simpler
 * single-IP header) since different hosting setups populate different
 * headers. In local dev with no proxy in front at all, none of these
 * are set by the browser — ipAddress will be null there, which is
 * expected (a super-admin testing on localhost is not a real visitor).
 */
function getRequestMeta(request) {
  const ipAddress =
    request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request?.headers?.get("cf-connecting-ip")?.trim() ||
    request?.headers?.get("x-real-ip")?.trim() ||
    null;
  const userAgent = request?.headers?.get("user-agent") ?? null;
  return { ipAddress, userAgent };
}

/**
 * detectAnomalies
 * Compares the incoming event against the actor's most recent prior
 * SecurityLog row and returns { isNewDevice, isAnomalous, anomalyReason }.
 * Never throws — any failure here just means the row gets written
 * without an anomaly flag rather than blocking the login.
 *
 * @param {string} actor
 * @param {string} deviceFingerprint
 * @param {{latitude: number|null, longitude: number|null, city: string|null, country: string|null}} geo
 */
async function detectAnomalies(actor, deviceFingerprint, geo) {
  const result = { isNewDevice: false, isAnomalous: false, anomalyReason: null };
  if (!actor) return result;

  try {
    const previousLogin = await prisma.securityLog.findFirst({
      where: { actor, eventType: "login_success" },
      orderBy: { createdAt: "desc" },
    });

    if (!previousLogin) return result;

    // New device: this fingerprint has never been recorded for this actor before.
    if (previousLogin.deviceFingerprint && previousLogin.deviceFingerprint !== deviceFingerprint) {
      result.isNewDevice = true;
      result.isAnomalous = true;
      result.anomalyReason = "New device: sign-in from a device/browser not seen for this account before.";
    }

    // Impossible travel: both logins have coordinates, and the implied
    // speed between them exceeds what's physically plausible.
    if (
      previousLogin.latitude != null &&
      previousLogin.longitude != null &&
      geo.latitude != null &&
      geo.longitude != null
    ) {
      const distanceKm = haversineDistanceKm(
        previousLogin.latitude,
        previousLogin.longitude,
        geo.latitude,
        geo.longitude
      );
      const hoursElapsed = Math.max(
        (Date.now() - new Date(previousLogin.createdAt).getTime()) / (1000 * 60 * 60),
        1 / 60 // floor at one minute so a same-minute login never divides by ~0
      );
      const impliedSpeedKmh = distanceKm / hoursElapsed;

      if (distanceKm > 300 && impliedSpeedKmh > IMPOSSIBLE_TRAVEL_SPEED_KMH) {
        const fromLabel = previousLogin.city ? `${previousLogin.city}, ${previousLogin.country}` : previousLogin.country ?? "an unknown location";
        const toLabel = geo.city ? `${geo.city}, ${geo.country}` : geo.country ?? "an unknown location";
        result.isAnomalous = true;
        result.anomalyReason = `Impossible travel: ${fromLabel} -> ${toLabel} in ${hoursElapsed.toFixed(2)}h (implies ~${Math.round(impliedSpeedKmh)} km/h).`;
      }
    }

    return result;
  } catch (error) {
    console.error("[securityLog] Anomaly detection failed:", error.message);
    return result;
  }
}

/**
 * logSecurityEvent
 * @param {object} input
 * @param {string} input.eventType - "login_success" | "login_failed" |
 *   "admin_login_denied" | "rate_limit_hit" | "admin_action" |
 *   "sql_injection_attempt" | "system_retention_purge"
 * @param {string|null} input.actor - email or admin name tied to the event
 * @param {Request|null} input.request - incoming Request, for IP/user-agent
 * @param {string|null} input.details - human-readable one-line summary
 * @returns {Promise<object|null>} the created SecurityLog row (with
 *   isAnomalous/anomalyReason/ipAddress), or null if the write failed
 */
export async function logSecurityEvent({ eventType, actor = null, request = null, details = null }) {
  const { ipAddress, userAgent } = getRequestMeta(request);

  try {
    const { deviceType, browserName, osName } = parseDeviceInfo(userAgent);
    const deviceFingerprint = generateDeviceFingerprint(actor, userAgent);
    const geo = await lookupGeoLocation(ipAddress);

    let anomaly = { isNewDevice: false, isAnomalous: false, anomalyReason: null };
    if (ANOMALY_ELIGIBLE_EVENT_TYPES.has(eventType)) {
      anomaly = await detectAnomalies(actor, deviceFingerprint, geo);
    }

    // Returned (not just written) so callers like the login route can
    // react to isAnomalous/ipAddress in real time — e.g. to trigger
    // Gatekeeper 3 of the breach response the moment an anomalous
    // admin login is detected, without a second DB read.
    return await prisma.securityLog.create({
      data: {
        eventType,
        actor,
        ipAddress,
        userAgent,
        details,
        deviceType,
        browserName,
        osName,
        deviceFingerprint,
        isNewDevice: anomaly.isNewDevice,
        country: geo.country,
        countryCode: geo.countryCode,
        city: geo.city,
        latitude: geo.latitude,
        longitude: geo.longitude,
        isAnomalous: anomaly.isAnomalous,
        anomalyReason: anomaly.anomalyReason,
      },
    });
  } catch (error) {
    // Logging must never take down the actual request — just surface it server-side.
    console.error("[securityLog] Failed to write security log:", error.message);
    return null;
  }
}
