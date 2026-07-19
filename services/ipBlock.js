/**
 * FILE: services/ipBlock.js
 * PURPOSE:
 * Checks whether a given IP address is currently blocked (added manually,
 * or by Gatekeeper 1/2 rate-limit escalation). Read by proxy.js on every
 * request to short-circuit blocked IPs before they reach any route.
 *
 * Uses the transaction-pooler Prisma client (adapter pattern, Rule 37.2) —
 * this is a simple point lookup, not a schema/session operation.
 */
import { prisma } from "@/services/prisma";

/**
 * isIpBlocked
 * Looks up the IP in the BlockedIp table. Returns true if a matching,
 * non-expired block exists.
 *
 * @param {string} ipAddress - the requester's IP (from x-forwarded-for)
 */
export async function isIpBlocked(ipAddress) {
  if (!ipAddress) return false;

  try {
    const blockedRecord = await prisma.blockedIp.findFirst({
      where: {
        ipAddress,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    return Boolean(blockedRecord);
  } catch (error) {
    // Never let a lookup failure fail-open on a security check silently —
    // log it, but still block by default until the DB is reachable again.
    console.error("[ipBlock] Lookup failed, blocking by default:", error.message);
    return true;
  }
}