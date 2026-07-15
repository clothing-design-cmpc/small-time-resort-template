/**
 * FILE: services/ipBlock.js
 * PURPOSE:
 * Two small, focused helpers around the BlockedIp table:
 *   - isIpBlocked()  -> called by middleware.js on every request
 *   - blockIp()      -> called by services/breachResponse.js the
 *                       instant a gatekeeper trips
 *
 * Kept deliberately tiny and dependency-free (no other service
 * imports this) so middleware.js — which runs on every single request
 * — pulls in as little as possible.
 *
 * DATA FLOW:
 * 1. A guest or attacker's request hits middleware.js
 * 2. middleware.js awaits isIpBlocked(ip) before anything else runs
 * 3. If blocked, the request never reaches any page or API route —
 *    middleware.js returns a plain 403 directly
 */
import { prisma } from "@/services/prisma";

/**
 * isIpBlocked
 * Returns true if this exact IP has an active BlockedIp row.
 * Fails OPEN (returns false) on any DB error — a broken lookup must
 * never be the reason the entire live site goes down for everyone;
 * that would turn a DB hiccup into a self-inflicted denial of service.
 *
 * @param {string|null} ipAddress
 */
export async function isIpBlocked(ipAddress) {
  if (!ipAddress) return false;

  try {
    const blocked = await prisma.blockedIp.findUnique({
      where: { ipAddress },
      select: { id: true },
    });
    return Boolean(blocked);
  } catch (error) {
    console.error("[ipBlock] Lookup failed, failing open:", error.message);
    return false;
  }
}

/**
 * blockIp
 * Records a new blocked IP. Uses upsert so a repeat trip from an
 * already-blocked IP (the attacker retrying after gatekeeper 1 already
 * fired) never throws a unique-constraint error — it just refreshes
 * the reason/gatekeeper instead of creating a duplicate row.
 *
 * TESTING TOGGLE: set GATEKEEPER_IP_BLOCK_DISABLED=true in .env.local
 * to skip writing the BlockedIp row entirely — everything else in the
 * breach response (BreachEvent, site lockdown, backup trigger, alert
 * email) still fires normally, so a developer can manually click
 * through the full flow in a browser without locking their own IP out
 * and having to delete rows from BlockedIp between every test run.
 * *** NEVER set this in production — it disables the actual defense. ***
 *
 * @param {string} ipAddress
 * @param {string} reason - human-readable, e.g. "Exceeded login rate limit — Gatekeeper 1"
 * @param {number|null} gatekeeper - 1, 2, or 3
 * @param {string} blockedBy - "system" for auto-blocks, or a super-admin uid for manual blocks
 */
export async function blockIp(ipAddress, reason, gatekeeper = null, blockedBy = "system") {
  if (!ipAddress) return null;

  if (process.env.GATEKEEPER_IP_BLOCK_DISABLED === "true") {
    console.warn(
      `[ipBlock] GATEKEEPER_IP_BLOCK_DISABLED is true — skipped blocking ${ipAddress}. ` +
        "Remove this env var before deploying to production."
    );
    return null;
  }

  try {
    return await prisma.blockedIp.upsert({
      where: { ipAddress },
      update: { reason, gatekeeper, blockedBy },
      create: { ipAddress, reason, gatekeeper, blockedBy },
    });
  } catch (error) {
    console.error("[ipBlock] Failed to block IP:", error.message);
    return null;
  }
}
