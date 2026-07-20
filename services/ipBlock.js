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
 * Looks up the IP in the BlockedIp table. Blocks have no expiry in this
 * schema — a row's presence alone means blocked, until a super-admin
 * unbans it via app/api/admin/blocked-ips/unban/route.js's deleteMany.
 *
 * @param {string} ipAddress - the requester's IP (from x-forwarded-for)
 */
export async function isIpBlocked(ipAddress) {
  if (!ipAddress) return false;

  try {
    const blockedRecord = await prisma.blockedIp.findUnique({
      where: { ipAddress },
    });

    return Boolean(blockedRecord);
  } catch (error) {
    // Never let a lookup failure fail-open on a security check silently —
    // log it, but still block by default until the DB is reachable again.
    console.error("[ipBlock] Lookup failed, blocking by default:", error.message);
    return true;
  }
}

/**
 * blockIp
 * Inserts (or refreshes) a BlockedIp row for the given IP. Called only
 * from services/breachResponse.js's Step 1 when Gatekeeper 1 or 2 trips
 * (see that file's own comment on why Gatekeeper 3 never calls this).
 * Upsert on the unique ipAddress column — a repeat trip from an IP
 * that's somehow still reachable (e.g. blocked mid-request) just
 * refreshes the reason/gatekeeper/timestamp instead of erroring on the
 * unique constraint.
 *
 * @param {string} ipAddress - the offending IP to block
 * @param {string} reason    - human-readable reason, shown on the vault's "View Blocked IPs" list
 * @param {number} gatekeeper - 1 or 2, which gate this IP tripped
 */
export async function blockIp(ipAddress, reason, gatekeeper) {
  await prisma.blockedIp.upsert({
    where: { ipAddress },
    update: { reason, gatekeeper, blockedBy: "system" },
    create: { ipAddress, reason, gatekeeper, blockedBy: "system" },
  });
}