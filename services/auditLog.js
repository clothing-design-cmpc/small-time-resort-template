/**
 * FILE: services/auditLog.js
 * PURPOSE:
 * Writes one row to AuditLog for every content or settings change made
 * in the superAdmin CMS (rooms, amenities, shop products, activities,
 * testimonials, gallery, policies, homepage, booking rules, blackout
 * dates, seasonal pricing). This is Rule 6's "who changed what content"
 * trail — kept in its own table, separate from SecurityLog (Rule 38's
 * login attempts, anomalies, and attacks). See /superAdmin/audit-logs
 * vs /superAdmin/security-logs: two separate pages for two separate
 * purposes.
 *
 * Logging must NEVER break the request it's attached to — every call
 * is wrapped in try/catch and failures are only console.error'd, never
 * re-thrown, so a DB hiccup on the log write can't turn a successful
 * content save into a failed request.
 *
 * DATA FLOW:
 * 1. A superAdmin content/settings route handler calls logAuditEvent()
 *    right after its own create/update/delete succeeds
 * 2. IP is read straight off the incoming Request here so every call
 *    site doesn't have to repeat that extraction logic
 * 3. app/api/admin/audit-logs/route.js reads this table back for the
 *    superAdmin Audit Logs page (paginated, filterable by actor/target
 *    type/action)
 */
import { prisma } from "./prisma.js";

/**
 * getRequestIp
 * Same header-priority order as services/securityLog.js's
 * getRequestMeta, kept local here since AuditLog only ever needs the
 * IP, never the full user-agent/device breakdown.
 */
function getRequestIp(request) {
  return (
    request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request?.headers?.get("cf-connecting-ip")?.trim() ||
    request?.headers?.get("x-real-ip")?.trim() ||
    null
  );
}

/**
 * logAuditEvent
 * @param {object} input
 * @param {string|null} input.actor - the admin's email/name who made the change
 * @param {"created"|"updated"|"deleted"} input.action
 * @param {string} input.targetType - e.g. "Room", "Policy", "BookingRule"
 * @param {string|null} input.targetId - the affected row's id, when it still exists
 * @param {string|null} input.targetName - human-readable label (kept even after deletion)
 * @param {string|null} input.details - human-readable one-line summary
 * @param {Request|null} input.request - incoming Request, for IP
 * @returns {Promise<object|null>} the created AuditLog row, or null if the write failed
 */
export async function logAuditEvent({
  actor = null,
  action,
  targetType,
  targetId = null,
  targetName = null,
  details = null,
  request = null,
}) {
  try {
    return await prisma.auditLog.create({
      data: {
        actor,
        action,
        targetType,
        targetId,
        targetName,
        details,
        ipAddress: getRequestIp(request),
      },
    });
  } catch (error) {
    // Logging must never take down the actual request — just surface it server-side.
    console.error("[auditLog] Failed to write audit log:", error.message);
    return null;
  }
}
