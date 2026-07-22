/**
 * FILE: services/accountActivity.js
 * ROLE: Rule 42 — Account Activity Log (authenticated accounts only)
 *
 * PURPOSE:
 * Records what a logged-in super-admin/staff account did — page visited
 * or a specific action — never for anonymous public visitors (that's
 * Rule 41's PageViewDaily, which is aggregate-only). accountId is
 * required; there is deliberately no code path in this file that can
 * write a row without one.
 *
 * DATA FLOW:
 * 1. app/api/account-activity/track/route.js (page-view beacon, called
 *    only from inside app/superAdmin/layout.jsx — the authenticated
 *    shell) or an admin action route calls recordAccountActivity()
 * 2. Country/city is resolved from the request IP in-memory via the
 *    self-hosted MaxMind DB (services/geoip.js — same source already
 *    fixed for Security Logs, Rule 38.5). Was previously reading the
 *    bundled geoip-lite dataset instead, which returned wrong/blank
 *    city and country for a large share of real admin IPs.
 * 3. A row is inserted into account_activity_logs
 */
import { lookupGeoLocation } from "@/services/geoip";
import { prisma } from "@/services/prisma";

/**
 * resolveLocation
 * City/country-level only, from the request IP — same rounding/precision
 * philosophy as protocol Rule 38.5: never a precise GPS coordinate.
 */
async function resolveLocation(request) {
  const ipAddress = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!ipAddress) return { ipAddress: null, geoCity: null, geoCountry: null };

  try {
    const location = await lookupGeoLocation(ipAddress);
    return {
      ipAddress,
      geoCity: location.city ?? null,
      geoCountry: location.countryCode ?? null,
    };
  } catch {
    return { ipAddress, geoCity: null, geoCountry: null };
  }
}

function resolveDeviceType(request) {
  const userAgent = request?.headers?.get("user-agent") ?? "";
  if (/tablet|ipad/i.test(userAgent)) return "tablet";
  if (/mobi|android|iphone/i.test(userAgent)) return "mobile";
  return "desktop";
}

/**
 * recordAccountActivity
 * Writes one AccountActivityLog row for an authenticated account.
 * Never breaks the caller's request — every failure is caught and only
 * console.error'd, same pattern as logSecurityEvent() and recordPageView().
 *
 * @param {Request} request - incoming Request, used to resolve IP/location/device
 * @param {string} accountId - the logged-in account's id (required — never anonymous)
 * @param {string} action - page path for a simple view, or a named action
 */
export async function recordAccountActivity({ request, accountId, action }) {
  if (!accountId) return; // Guardrail: this table is never for anonymous traffic.

  try {
    const { ipAddress, geoCity, geoCountry } = await resolveLocation(request);
    const deviceType = resolveDeviceType(request);
    const userAgent = request?.headers?.get("user-agent") ?? null;

    await prisma.accountActivityLog.create({
      data: { accountId, action, ipAddress, geoCity, geoCountry, deviceType, userAgent },
    });
  } catch (error) {
    console.error("[accountActivity] Failed to record activity:", error.message);
  }
}
