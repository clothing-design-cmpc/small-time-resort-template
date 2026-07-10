/**
 * FILE: services/geoip.js
 * PURPOSE:
 * Resolves an IP address to a country/city/lat-long using a
 * self-hosted MaxMind GeoIP2 database file (.mmdb) — no external API
 * call, no third-party service seeing every visitor's IP. The .mmdb
 * file is downloaded once (MaxMind GeoLite2-City, free with a MaxMind
 * account) and refreshed periodically; its path is read from
 * MAXMIND_DB_PATH.
 *
 * DATA FLOW:
 * 1. services/securityLog.js calls lookupGeoLocation(ipAddress) on
 *    every write that has an IP
 * 2. The .mmdb file is opened once per server process and cached in
 *    memory (openReader) — every subsequent lookup reads that cache,
 *    no disk I/O and no network call per request
 * 3. Loopback/private IPs and lookup misses return an all-null result
 *    rather than throwing, so a missing/stale DB file can never break
 *    the login flow it's attached to
 */
import { readFile } from "node:fs/promises";
import { Reader } from "maxmind";

// Loopback and private-network ranges never resolve to a real location —
// checking these first avoids a wasted lookup and a confusing "unknown"
// row in local development.
const NON_ROUTABLE_PATTERN = /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/;

let readerPromise = null;

/**
 * getReader
 * Lazily opens the .mmdb file exactly once per server process and
 * reuses the same in-memory Reader for every subsequent call — the
 * whole point of self-hosting the DB is avoiding a network round trip
 * per lookup, so this must never re-read the file per request.
 */
function getReader() {
  if (!readerPromise) {
    readerPromise = (async () => {
      const dbPath = process.env.MAXMIND_DB_PATH;
      if (!dbPath) {
        console.error("[geoip] MAXMIND_DB_PATH is not set — geolocation will be skipped.");
        return null;
      }
      try {
        const buffer = await readFile(dbPath);
        return new Reader(buffer);
      } catch (error) {
        // Missing/corrupt DB file must never block a login — just log and
        // fall back to null geolocation for every lookup this process makes.
        console.error("[geoip] Failed to open MaxMind DB at", dbPath, "-", error.message);
        return null;
      }
    })();
  }
  return readerPromise;
}

/**
 * lookupGeoLocation
 * @param {string|null} ipAddress
 * @returns {Promise<{country: string|null, countryCode: string|null,
 *   city: string|null, latitude: number|null, longitude: number|null}>}
 */
export async function lookupGeoLocation(ipAddress) {
  const empty = { country: null, countryCode: null, city: null, latitude: null, longitude: null };

  if (!ipAddress || NON_ROUTABLE_PATTERN.test(ipAddress)) return empty;

  const reader = await getReader();
  if (!reader) return empty;

  try {
    const result = reader.get(ipAddress);
    if (!result) return empty;

    return {
      country: result.country?.names?.en ?? null,
      countryCode: result.country?.iso_code ?? null,
      city: result.city?.names?.en ?? null,
      latitude: result.location?.latitude ?? null,
      longitude: result.location?.longitude ?? null,
    };
  } catch (error) {
    // A malformed IP string should never throw past this point.
    console.error("[geoip] Lookup failed for", ipAddress, "-", error.message);
    return empty;
  }
}

/**
 * haversineDistanceKm
 * Great-circle distance between two lat/long points, in kilometers.
 * Used by services/securityLog.js to detect "impossible travel" —
 * e.g. a login from Manila followed four minutes later by a login
 * from Berlin implies a physically impossible speed.
 */
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const EARTH_RADIUS_KM = 6371;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;

  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}
