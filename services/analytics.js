/**
 * FILE: services/analytics.js
 * ROLE: Rule 41 — Anonymized Traffic Analytics
 *
 * PURPOSE:
 * Resolves a request's country (from IP, in-memory only — the IP itself
 * is NEVER written anywhere) and device type, then upserts a running
 * counter row on PageViewDaily. This is aggregate-only: no session id,
 * no visitor id, no per-person row ever exists in this table. Logging
 * must NEVER break the request it's attached to — same pattern as
 * services/securityLog.js.
 *
 * DATA FLOW:
 * 1. app/api/analytics/track/route.js calls recordPageView() with the
 *    incoming Request and the path the visitor is on
 * 2. resolveCountryCode() looks up the request IP against the
 *    self-hosted MaxMind DB (services/geoip.js — same source already
 *    fixed for Security Logs, Rule 38.5) and returns only a 2-letter
 *    country code. Was previously reading the bundled geoip-lite
 *    dataset instead, which ships a much smaller, staler IP range
 *    table than MaxMind and returned wrong/blank countries for a
 *    large share of real visitor IPs.
 * 3. resolveDeviceType() classifies the User-Agent into mobile/tablet/desktop
 * 4. A daily counter row is upserted (created at viewCount 1, or
 *    incremented) keyed on [date, path, referrerHost, deviceType, countryCode]
 */
import { lookupGeoLocation } from "@/services/geoip";
import { prisma } from "@/services/prisma";

/**
 * resolveLocation
 * Looks up the request's IP against the self-hosted MaxMind DB and
 * returns only the 2-letter country code plus the city name — city
 * added so the Analytics "Top Locations" panel can show specific,
 * accurate locations instead of country-only buckets. The IP itself
 * is read once into this function's local variable and discarded —
 * it is never passed to logSecurityEvent, never written to any
 * table, and never returned to the caller. Still Rule 41-compliant:
 * city/country granularity only, no coordinates, no per-visitor row.
 */
async function resolveLocation(request) {
  const ipAddress = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ipAddress) return { countryCode: null, city: null };

  try {
    const location = await lookupGeoLocation(ipAddress);
    return {
      countryCode: location.countryCode ?? null, // ISO 3166-1 alpha-2, e.g. "PH"
      city: location.city ?? null,
    };
  } catch {
    return { countryCode: null, city: null };
  }
}

/**
 * resolveDeviceType
 * Simple User-Agent classification — good enough for traffic-shape
 * insight (Rule 41 scope), not meant to be a precise device fingerprint.
 */
function resolveDeviceType(request) {
  const userAgent = request?.headers?.get("user-agent") ?? "";
  if (/tablet|ipad/i.test(userAgent)) return "tablet";
  if (/mobi|android|iphone/i.test(userAgent)) return "mobile";
  return "desktop";
}

/**
 * recordPageView
 * Upserts today's counter row for this path/referrer/device/country
 * combination. Never throws — a failed analytics write must not affect
 * the visitor's page load.
 *
 * @param {Request} request - incoming Request, used only in-memory to
 *   resolve country + device (never persisted)
 * @param {string} path - the page path being viewed, e.g. "/visitor/booking"
 * @param {string|null} referrerHost - hostname of document.referrer, or
 *   null for direct traffic
 */
export async function recordPageView({ request, path, referrerHost = null }) {
  try {
    // Prisma's compound @@unique where clause rejects null members outright
    // (SQL NULL never equals NULL, so it can't match a composite unique key) —
    // every upsert with a missing country or direct-traffic referrer was
    // throwing before it ever reached the DB. Substitute the same sentinel
    // values the admin analytics reader already falls back to display
    // (app/api/admin/analytics/route.js: "Direct" / "Unknown"), so read and
    // write sides agree on what a missing value looks like.
    const { countryCode: resolvedCountryCode, city: resolvedCity } = await resolveLocation(request);
    const countryCode = resolvedCountryCode ?? "Unknown";
    const geoCity = resolvedCity ?? "Unknown";
    const resolvedReferrerHost = referrerHost ?? "Direct";
    const deviceType = resolveDeviceType(request);

    // Truncate to a date-only value (midnight) so all views on the same
    // calendar day roll into the same counter row.
    const today = new Date();
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    await prisma.pageViewDaily.upsert({
      where: {
        date_path_referrerHost_deviceType_countryCode_geoCity: {
          date,
          path,
          referrerHost: resolvedReferrerHost,
          deviceType,
          countryCode,
          geoCity,
        },
      },
      update: { viewCount: { increment: 1 } },
      create: { date, path, referrerHost: resolvedReferrerHost, deviceType, countryCode, geoCity, viewCount: 1 },
    });
  } catch (error) {
    // Analytics must never break the visitor's request — surface it server-side only.
    console.error("[analytics] Failed to record page view:", error.message);
  }
}