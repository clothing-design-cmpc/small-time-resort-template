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