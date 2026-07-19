/**
 * FILE: services/postWipeLockdown.js
 * PURPOSE:
 * Three small, focused helpers around SystemSettings.postWipeLockdown
 * (Task 2):
 *   - isPostWipeLockdownActive() -> called by proxy.js on every request
 *   - activatePostWipeLockdown() -> called the INSTANT a wipe is
 *     confirmed (truncate-now routes), not after the TRUNCATE finishes
 *   - liftPostWipeLockdown()     -> called ONLY by
 *     app/api/admin/post-wipe-lockdown/route.js (vault-session gated)
 *
 * Kept deliberately tiny and dependency-free (no other service imports
 * this), same reasoning as services/ipBlock.js — proxy.js runs on
 * every single request, so it should pull in as little as possible.
 *
 * WHY activatePostWipeLockdown() FIRES BEFORE THE TRUNCATE, NOT AFTER:
 * The lockdown used to only get flipped on inside
 * scripts/runDatabaseWipe.js, after its TRUNCATE transaction actually
 * succeeded on GitHub's runner — meaning a super-admin stayed fully
 * logged in for however long that Action took to pick up, connect, and
 * run (tens of seconds to a couple minutes), and stayed logged in
 * INDEFINITELY if that transaction failed for any reason (e.g. a table
 * name mismatch aborting the whole $transaction). If "TRUNCATE NOW"
 * was ever confirmed during a real compromise, that gap is exactly the
 * window an attacker still has full run of the panel. Locking down and
 * signing the admin out is now a synchronous first step of the
 * "TRUNCATE NOW" API routes themselves — before the workflow dispatch,
 * before the actual TRUNCATE — so the site is dark and the admin is
 * logged out within the same request/response, regardless of whether
 * the truncate that follows succeeds, fails, or is still running.
 *
 * DATA FLOW:
 * 1. app/api/superAdmin/wipe/truncate-now/route.js and its vault
 *    mirror (app/api/admin/vault-wipe/truncate-now/route.js) call
 *    activatePostWipeLockdown() immediately once the typed
 *    confirmation (+ vault step-up code, for the vault route) checks
 *    out — before dispatching the GitHub Actions executor
 * 2. scripts/runDatabaseWipe.js also calls this same helper right
 *    after its TRUNCATE succeeds, as a safety net for the *scheduled*
 *    (non-bypassed) 24-hour path, where no button-press moment exists
 *    to activate it early — this call is a no-op if already active
 * 3. proxy.js awaits isPostWipeLockdownActive() before anything else
 *    (after the existing Gatekeeper IP-block check) — if active, every
 *    visitor page, every /superAdmin page, and every /api route except
 *    the vault's own standalone paths gets redirected/503'd, and the
 *    "session" cookie is cleared on the response (Task 2's automatic
 *    super-admin logout)
 * 4. Only the hidden vault recovery page can call liftPostWipeLockdown()
 *    to bring the site back — see RecoveryClient.jsx's "Post-Wipe
 *    Lockdown" section and app/api/admin/post-wipe-lockdown/route.js
 */
import { prisma } from "@/services/prisma";

const POST_WIPE_MAINTENANCE_MESSAGE =
  "This website's database was just wiped as scheduled and is currently under maintenance. Sorry for the inconvenience — please check back shortly.";

/**
 * activatePostWipeLockdown
 * Flips postWipeLockdown + maintenanceMode ON immediately. Safe to
 * call more than once (idempotent upsert) — the caller in
 * scripts/runDatabaseWipe.js relies on that, since the route-level
 * call above may already have activated it by the time the actual
 * TRUNCATE finishes.
 *
 * Accepts an optional `client` override. The default (this file's own
 * `prisma` import) reads DATABASE_URL, which is correct for the two
 * Next.js API routes that call this — but scripts/runDatabaseWipe.js
 * runs standalone on a GitHub Actions runner whose env only sets
 * DIRECT_URL (see database-wipe-executor.yml's `env:` block), so it
 * passes its own DIRECT_URL-based PrismaClient in here instead of
 * letting this file try to connect with an undefined DATABASE_URL.
 */
export async function activatePostWipeLockdown(client = prisma) {
  await client.systemSettings.upsert({
    where: { id: "singleton" },
    update: {
      postWipeLockdown: true,
      postWipeLockdownAt: new Date(),
      maintenanceMode: true,
      maintenanceMessage: POST_WIPE_MAINTENANCE_MESSAGE,
    },
    create: {
      id: "singleton",
      postWipeLockdown: true,
      postWipeLockdownAt: new Date(),
      maintenanceMode: true,
      maintenanceMessage: POST_WIPE_MAINTENANCE_MESSAGE,
    },
  });
}

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
