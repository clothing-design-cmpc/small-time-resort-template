/**
 * FILE: services/adminAccessLimit.js
 * PURPOSE:
 * Central helper for the "Admin Access Limit" feature — caps how many
 * devices/browsers can be logged in as super_admin at the same time.
 * Every read/write against SystemSettings.maxAdminSessions and the
 * AdminSession table goes through here, so the login route, the
 * public access-status route, and the settings page all agree on the
 * exact same counting logic.
 *
 * DATA FLOW:
 * 1. app/api/auth/login/route.js calls getAdminAccessLimitStatus()
 *    right after confirming the account is a super_admin, and BEFORE
 *    Gatekeeper 3 anomaly processing — a login blocked here never
 *    reaches or skips GK3, it simply never becomes a successful login
 *    in the first place, so GK3 keeps working exactly as before for
 *    every login that does get through.
 * 2. On a successful login, createAdminSession() writes one row so
 *    this device/browser now counts toward the limit.
 * 3. app/api/auth/logout/route.js calls deleteAdminSession() so
 *    signing out immediately frees up a slot.
 * 4. app/api/auth/access-status/route.js (public) calls
 *    getAdminAccessLimitStatus() so the login page can disable its
 *    inputs before anyone even types a password.
 * 5. app/api/superAdmin/settings/admin-access-limit/route.js calls
 *    updateMaxAdminSessions() when the super-admin saves a new limit.
 */
import { prisma } from "./prisma.js";

/**
 * getActiveAdminSessionCount
 * Counts AdminSession rows that haven't expired yet. A session can go
 * stale without an explicit logout (browser crash, killed process) —
 * expiresAt mirrors the session cookie's own 7-day maxAge, so a stale
 * row simply stops counting on its own once it passes that point,
 * with no separate cleanup job required.
 */
export async function getActiveAdminSessionCount() {
  return prisma.adminSession.count({
    where: { expiresAt: { gt: new Date() } },
  });
}

/**
 * getAdminAccessLimitStatus
 * Returns the current limit, how many sessions are active right now,
 * and whether a NEW login would be blocked. maxAdminSessions === null
 * means unlimited — limitReached is always false in that case.
 */
export async function getAdminAccessLimitStatus() {
  const settings = await prisma.systemSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    select: { maxAdminSessions: true },
  });

  const activeSessionCount = await getActiveAdminSessionCount();
  const maxAdminSessions = settings.maxAdminSessions;
  const limitReached = maxAdminSessions !== null && activeSessionCount >= maxAdminSessions;

  return { maxAdminSessions, activeSessionCount, limitReached };
}

/**
 * updateMaxAdminSessions
 * Saves a new limit (or null for unlimited) onto the SystemSettings
 * singleton row. Called only from the super-admin settings route —
 * the actual auth check happens there, not here.
 *
 * @param maxAdminSessions - positive integer, or null for unlimited
 * @param updatedBy        - AdminProfile.id (uid) of the super-admin saving this
 */
export async function updateMaxAdminSessions(maxAdminSessions, updatedBy) {
  return prisma.systemSettings.upsert({
    where: { id: "singleton" },
    update: {
      maxAdminSessions,
      maxAdminSessionsUpdatedAt: new Date(),
      maxAdminSessionsUpdatedBy: updatedBy ?? null,
    },
    create: {
      id: "singleton",
      maxAdminSessions,
      maxAdminSessionsUpdatedAt: new Date(),
      maxAdminSessionsUpdatedBy: updatedBy ?? null,
    },
    select: { maxAdminSessions: true, maxAdminSessionsUpdatedAt: true },
  });
}

/**
 * createAdminSession
 * Writes one AdminSession row for a device/browser that just logged
 * in successfully. id must match the "sid" embedded in that same
 * request's session cookie payload, so logout can delete this exact
 * row later without touching this admin's other active sessions.
 */
export async function createAdminSession({ id, adminId, ipAddress, expiresAt }) {
  try {
    await prisma.adminSession.create({
      data: { id, adminId, ipAddress: ipAddress ?? null, expiresAt },
    });
  } catch (error) {
    // Never let a session-tracking write break a successful login —
    // worst case, this one device just doesn't count toward the limit.
    console.error("[adminAccessLimit] Failed to create session row:", error.message);
  }
}

/**
 * deleteAdminSession
 * Removes one AdminSession row by id (the "sid" decoded from the
 * session cookie being cleared). Best-effort — a missing/already-gone
 * row is not an error, and a DB hiccup here must never block sign-out.
 */
export async function deleteAdminSession(id) {
  if (!id) return;
  try {
    await prisma.adminSession.delete({ where: { id } });
  } catch {
    // Row may already be gone (expired + swept, or double logout) —
    // nothing to do.
  }
}
