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
 * DATA FLOW:
 * 1. A route handler (login, rate-limited routes, admin mutation
 *    routes) calls logSecurityEvent() after the outcome is known
 * 2. IP/user-agent are read straight off the incoming Request here so
 *    every call site doesn't have to repeat that extraction logic
 */
import { prisma } from "@/services/prisma";

/**
 * getRequestMeta
 * Pulls the caller's IP (from the x-forwarded-for header, since Next.js
 * route handlers sit behind a proxy in most deployments) and user-agent
 * off the Request object.
 */
function getRequestMeta(request) {
  const ipAddress = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request?.headers?.get("user-agent") ?? null;
  return { ipAddress, userAgent };
}

/**
 * logSecurityEvent
 * @param {object} input
 * @param {string} input.eventType - "login_success" | "login_failed" |
 *   "admin_login_denied" | "rate_limit_hit" | "admin_action"
 * @param {string|null} input.actor - email or admin name tied to the event
 * @param {Request|null} input.request - incoming Request, for IP/user-agent
 * @param {string|null} input.details - human-readable one-line summary
 */
export async function logSecurityEvent({ eventType, actor = null, request = null, details = null }) {
  const { ipAddress, userAgent } = getRequestMeta(request);

  try {
    await prisma.securityLog.create({
      data: { eventType, actor, ipAddress, userAgent, details },
    });
  } catch (error) {
    // Logging must never take down the actual request — just surface it server-side.
    console.error("[securityLog] Failed to write security log:", error.message);
  }
}
