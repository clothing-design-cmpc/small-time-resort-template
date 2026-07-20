/**
 * FILE: services/postWipeLockdown.js
 * PURPOSE:
 * Checks whether the site is currently under lockdown following a
 * detected breach/wipe. When active, proxy.js redirects all public
 * traffic to /maintenance and blocks everything except the vault route.
 *
 * Lockdown state lives in a single-row LockdownState table so it's
 * readable from any request without relying on in-memory state
 * (which wouldn't survive a serverless cold start or multiple instances).
 */
import { prisma } from "@/services/prisma";

/**
 * isPostWipeLockdownActive
 * Reads the single LockdownState row and returns its active flag.
 * Fails safe: if the check itself errors, treat lockdown as ACTIVE
 * so the site never accidentally serves guests during an unknown state.
 */
export async function isPostWipeLockdownActive() {
  try {
    const lockdownState = await prisma.lockdownState.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    return Boolean(lockdownState?.isActive);
  } catch (error) {
    console.error("[postWipeLockdown] Check failed, failing safe (locked):", error.message);
    return true;
  }
}

/**
 * liftPostWipeLockdown
 * Flips SystemSettings.postWipeLockdown + maintenanceMode back off and
 * clears postWipeLockdownAt. Mirrors services/breachResponse.js's own
 * lockdown-lift shape (see app/api/admin/breach/route.js's PATCH) —
 * one flag instead of two, no BreachEvent row to resolve here since a
 * scheduled wipe isn't tied to a gatekeeper incident.
 *
 * Called only from app/api/admin/post-wipe-lockdown/route.js's PATCH,
 * itself only reachable after the vault owner has used the "Fix SQL"
 * section to re-import a backup and confirmed the database looks
 * right again.
 */
export async function liftPostWipeLockdown() {
  await prisma.systemSettings.upsert({
    where: { id: "singleton" },
    update: { postWipeLockdown: false, maintenanceMode: false, postWipeLockdownAt: null },
    create: { id: "singleton", postWipeLockdown: false, maintenanceMode: false },
  });
}