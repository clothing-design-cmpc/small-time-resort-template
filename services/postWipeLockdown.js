/**
 * FILE: services/postWipeLockdown.js
 * PURPOSE:
 * Two small, focused helpers around SystemSettings.postWipeLockdown
 * (Task 2):
 *   - isPostWipeLockdownActive() -> called by proxy.js on every request
 *   - liftPostWipeLockdown()     -> called ONLY by
 *     app/api/admin/post-wipe-lockdown/route.js (vault-session gated)
 *
 * Kept deliberately tiny and dependency-free (no other service imports
 * this), same reasoning as services/ipBlock.js — proxy.js runs on
 * every single request, so it should pull in as little as possible.
 *
 * DATA FLOW:
 * 1. scripts/runDatabaseWipe.js flips SystemSettings.postWipeLockdown
 *    on the instant a scheduled wipe's TRUNCATE actually succeeds
 * 2. proxy.js awaits isPostWipeLockdownActive() before anything else
 *    (after the existing Gatekeeper IP-block check) — if active, every
 *    visitor page, every /superAdmin page, and every /api route except
 *    the vault's own standalone paths gets redirected/503'd, and the
 *    "session" cookie is cleared on the response (Task 2's automatic
 *    super-admin logout)
 * 3. Only the hidden vault recovery page can call liftPostWipeLockdown()
 *    to bring the site back — see RecoveryClient.jsx's "Post-Wipe
 *    Lockdown" section and app/api/admin/post-wipe-lockdown/route.js
 */
import { prisma } from "@/services/prisma";

/**
 * isPostWipeLockdownActive
 * Fails OPEN (returns false) on any DB error — a broken lookup must
 * never be the reason the entire live site goes down for everyone;
 * same reasoning as isIpBlocked()'s fail-open behavior.
 */
export async function isPostWipeLockdownActive() {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "singleton" },
      select: { postWipeLockdown: true },
    });
    return Boolean(settings?.postWipeLockdown);
  } catch (error) {
    console.error("[postWipeLockdown] Lookup failed, failing open:", error.message);
    return false;
  }
}

/**
 * liftPostWipeLockdown
 * Flips postWipeLockdown + maintenanceMode back off. Called only from
 * the vault-session-gated PATCH handler — never exposed to a regular
 * super-admin session, since a super-admin session is exactly what
 * this lockdown revokes on sight (proxy.js).
 */
export async function liftPostWipeLockdown() {
  await prisma.systemSettings.upsert({
    where: { id: "singleton" },
    update: { postWipeLockdown: false, postWipeLockdownAt: null, maintenanceMode: false },
    create: { id: "singleton", postWipeLockdown: false, maintenanceMode: false },
  });
}
