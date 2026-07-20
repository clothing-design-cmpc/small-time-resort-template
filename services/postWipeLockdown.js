/**
 * FILE: services/postWipeLockdown.js
 * PURPOSE:
 * Checks whether the site is currently under lockdown following a
 * completed database wipe. When active, proxy.js redirects all public
 * traffic to /maintenance and blocks everything except the vault route.
 *
 * Lockdown state lives on the single-row SystemSettings table
 * (postWipeLockdown / postWipeLockdownAt — see prisma/schema.prisma)
 * so it's readable from any request without relying on in-memory state
 * (which wouldn't survive a serverless cold start or multiple instances).
 * NOTE: this file previously queried a "LockdownState" model that was
 * never defined in schema.prisma — every check threw, was caught below,
 * and fell back to "locked", so the site stayed stuck in maintenance
 * mode permanently regardless of SystemSettings.postWipeLockdown's real
 * value. Reading SystemSettings directly (same table the API route and
 * liftPostWipeLockdown() below already use) fixes that mismatch.
 */
import { prisma } from "./prisma.js";

/**
 * isPostWipeLockdownActive
 * Reads SystemSettings.postWipeLockdown and returns it as a boolean.
 * Fails safe: if the check itself errors, treat lockdown as ACTIVE
 * so the site never accidentally serves guests during an unknown state.
 */
export async function isPostWipeLockdownActive() {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "singleton" },
      select: { postWipeLockdown: true },
    });

    return Boolean(settings?.postWipeLockdown);
  } catch (error) {
    console.error("[postWipeLockdown] Check failed, failing safe (locked):", error.message);
    return true;
  }
}

/**
 * activatePostWipeLockdown
 * Flips SystemSettings.postWipeLockdown + maintenanceMode ON and stamps
 * postWipeLockdownAt, the instant scripts/runDatabaseWipe.js's TRUNCATE
 * actually succeeds. Idempotent upsert — safe to call even if a prior
 * run already activated it. Accepts an optional prismaClient because
 * scripts/runDatabaseWipe.js runs on GitHub Actions with its own
 * DIRECT_URL-backed Prisma instance, not the shared app client this
 * file imports by default (see that script's own adapter setup).
 *
 * @param {import("@prisma/client").PrismaClient} [prismaClient] - defaults to the shared app client
 */
export async function activatePostWipeLockdown(prismaClient = prisma) {
  await prismaClient.systemSettings.upsert({
    where: { id: "singleton" },
    update: { postWipeLockdown: true, maintenanceMode: true, postWipeLockdownAt: new Date() },
    create: { id: "singleton", postWipeLockdown: true, maintenanceMode: true, postWipeLockdownAt: new Date() },
  });
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