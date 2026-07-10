/**
 * FILE: services/licenseGuard.js
 * ROLE: Used by middleware.js on every matched request — no account-specific role
 *
 * PURPOSE:
 * Confirms this deployment is running under a valid, currently-authorized
 * license before letting visitors or admins use the site. Villa Azure
 * Resort is a reusable template sold to clients — this is how the owner
 * (not the client) finds out if a client resells the template to someone
 * else on a different domain than the one it was licensed for.
 *
 * DATA FLOW:
 * 1. middleware.js calls checkLicense(domain) on every matched request
 * 2. This sends the deployment's secret RESORT_LICENSE_KEY + the current
 *    request domain to a Postgres RPC function (validate_license) hosted
 *    on a completely separate "License Manager" Supabase project that
 *    only the owner controls
 * 3. That RPC checks: does this key exist, is it "active", and does the
 *    domain match what's on record for this key -- returns { valid, reason }
 * 4. Result is cached in-memory for LICENSE_CACHE_TTL_MS so the license
 *    server isn't hit on every single page load
 *
 * WHY THIS IS SAFE TO SHIP INSIDE THE SOLD TEMPLATE:
 * LICENSE_SERVER_ANON_KEY is a public Supabase anon key for the OWNER'S
 * license project, not the client's own project -- it only allows calling
 * the validate_license RPC, which is written to return a yes/no verdict
 * for the one key/domain pair it was asked about. It cannot list, read,
 * or edit any other client's license row. The client can technically find
 * this key by reading the deployed code, but that only lets them ask
 * "is my own key valid" -- it can't reveal or forge someone else's key.
 */

const LICENSE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Module-level cache. Persists only for the lifetime of this warm
// server/Edge instance -- best-effort, not a source of truth. Never
// treat a cache hit as proof of anything beyond "we checked recently."
let cachedResult = null;
let cachedAt = 0;

/**
 * checkLicense
 * Returns { valid: boolean, reason: string } for the given domain.
 *
 * Fails "closed" (valid: false) ONLY when the license server explicitly
 * says the key/domain pair is invalid, revoked, or missing entirely.
 * Fails "open" (valid: true) on network errors, timeouts, or unexpected
 * server errors -- a temporary outage on the owner's license server must
 * never take down a paying client's live resort site. Open-fail events
 * are still logged so the owner can investigate.
 *
 * @param domain - the hostname the current request came in on (e.g. request.nextUrl.hostname)
 */
export async function checkLicense(domain) {
  const now = Date.now();
  if (cachedResult && now - cachedAt < LICENSE_CACHE_TTL_MS) {
    return cachedResult;
  }

  const licenseKey = process.env.RESORT_LICENSE_KEY;
  const serverUrl = process.env.LICENSE_SERVER_URL;
  const serverAnonKey = process.env.LICENSE_SERVER_ANON_KEY;

  // No license env vars set at all -- this is expected for the master/dev
  // copy of the template (and for any client deployment before the
  // License Manager project exists/has issued a key). Fail OPEN here,
  // not closed, so development on the template itself is never blocked.
  // Once a client is actually issued a key, these vars get set in their
  // .env.local and the real check below takes over.
  if (!licenseKey || !serverUrl || !serverAnonKey) {
    const result = { valid: true, reason: "no_license_configured" };
    cachedResult = result;
    cachedAt = now;
    return result;
  }

  try {
    const response = await fetch(`${serverUrl}/rest/v1/rpc/validate_license`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serverAnonKey,
        Authorization: `Bearer ${serverAnonKey}`,
      },
      body: JSON.stringify({ license_key: licenseKey, domain }),
      // Never let a slow/unreachable license server hang a visitor's request.
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      // Server reachable but returned an error -- fail open, log for review.
      console.error("[licenseGuard] Validation server responded with status", response.status);
      const result = { valid: true, reason: "validation_server_error" };
      cachedResult = result;
      cachedAt = now;
      return result;
    }

    const data = await response.json();
    const result = { valid: data?.valid === true, reason: data?.reason ?? "unknown" };
    cachedResult = result;
    cachedAt = now;
    return result;
  } catch (error) {
    // Network failure or timeout -- fail open so a temporary outage never
    // locks a legitimate, paying client out of their own live site.
    console.error("[licenseGuard] Validation request failed:", error.message);
    const result = { valid: true, reason: "validation_unreachable" };
    cachedResult = result;
    cachedAt = now;
    return result;
  }
}
