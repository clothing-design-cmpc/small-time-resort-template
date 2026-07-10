/**
 * FILE: services/deviceFingerprint.js
 * PURPOSE:
 * Parses an incoming request's User-Agent string into a readable
 * device type / browser / OS (for the Security Logs "Device" column),
 * and derives a stable fingerprint hash used by services/securityLog.js
 * to detect when an actor logs in from a device never seen before.
 *
 * No external UA-parsing library is added — the patterns below cover
 * the browsers/devices this project's guests and admins actually use,
 * and fall back to "unknown" cleanly for anything unrecognized rather
 * than guessing.
 *
 * DATA FLOW:
 * 1. services/securityLog.js calls parseDeviceInfo(userAgent) on every
 *    write to fill deviceType/browserName/osName
 * 2. services/securityLog.js calls generateDeviceFingerprint(actor,
 *    userAgent) and compares it against the actor's most recent
 *    fingerprint to flag isNewDevice
 */
import { createHash } from "node:crypto";

// Ordered most-specific-first — e.g. "iPad" must be checked before the
// generic "Mobile" token, and "Edg/" (Edge) before "Chrome" since
// Edge's UA string also contains "Chrome/" for compatibility.
const BROWSER_PATTERNS = [
  { name: "Edge", pattern: /Edg\// },
  { name: "Opera", pattern: /OPR\// },
  { name: "Chrome", pattern: /Chrome\// },
  { name: "Firefox", pattern: /Firefox\// },
  { name: "Safari", pattern: /Version\/.*Safari\// },
  { name: "Samsung Internet", pattern: /SamsungBrowser\// },
  { name: "Internet Explorer", pattern: /MSIE|Trident\// },
];

const OS_PATTERNS = [
  { name: "iOS", pattern: /iPhone|iPad|iPod/ },
  { name: "Android", pattern: /Android/ },
  { name: "Windows", pattern: /Windows NT/ },
  { name: "macOS", pattern: /Mac OS X/ },
  { name: "Linux", pattern: /Linux/ },
  { name: "Chrome OS", pattern: /CrOS/ },
];

// Known bot/crawler tokens — flagged as their own device type so
// automated traffic (uptime monitors, search crawlers, scanners) never
// gets miscounted as a real desktop/mobile guest in the Device filter.
const BOT_PATTERN = /bot|crawler|spider|curl|wget|python-requests|axios\/|postman/i;

/**
 * parseDeviceInfo
 * Returns { deviceType, browserName, osName } derived from the raw
 * User-Agent header. Every field falls back to "unknown" rather than
 * null so the UI always has a display-safe string.
 */
export function parseDeviceInfo(userAgent) {
  if (!userAgent) {
    return { deviceType: "unknown", browserName: "unknown", osName: "unknown" };
  }

  if (BOT_PATTERN.test(userAgent)) {
    return { deviceType: "bot", browserName: "unknown", osName: "unknown" };
  }

  const browserName = BROWSER_PATTERNS.find((b) => b.pattern.test(userAgent))?.name ?? "unknown";
  const osName = OS_PATTERNS.find((o) => o.pattern.test(userAgent))?.name ?? "unknown";

  // Device type: tablets self-identify via "iPad" or the Android UA's
  // explicit "; Tablet" hint; everything else with "Mobi" is a phone;
  // anything left over is treated as desktop.
  let deviceType = "desktop";
  if (/iPad|Tablet/.test(userAgent) || (/Android/.test(userAgent) && !/Mobile/.test(userAgent))) {
    deviceType = "tablet";
  } else if (/Mobi|iPhone|Android/.test(userAgent)) {
    deviceType = "mobile";
  }

  return { deviceType, browserName, osName };
}

/**
 * generateDeviceFingerprint
 * Produces a stable per-actor-per-device hash so the same person
 * logging in from the same browser/OS combination always yields the
 * same fingerprint, while a genuinely different device produces a
 * different one. Deliberately coarse (actor + UA only, no IP) — IP
 * changes constantly on mobile networks and would cause false "new
 * device" alerts on every login otherwise.
 *
 * @param {string|null} actor - email tied to the login attempt
 * @param {string|null} userAgent - raw User-Agent header
 * @returns {string} sha256 hex digest
 */
export function generateDeviceFingerprint(actor, userAgent) {
  const normalizedActor = (actor ?? "unknown").trim().toLowerCase();
  const normalizedUserAgent = (userAgent ?? "unknown").trim();
  return createHash("sha256").update(`${normalizedActor}::${normalizedUserAgent}`).digest("hex");
}
