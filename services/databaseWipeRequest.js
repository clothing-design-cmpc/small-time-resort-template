/**
 * FILE: services/databaseWipeRequest.js
 * PURPOSE:
 * All the LIGHTWEIGHT, in-app-safe database operations for the "Wipe
 * Database" danger-zone feature: creating a wipe request, cancelling
 * one, recording the super-admin's final "Continue" confirmation at
 * the 2-hour mark, and reading the current status for polling. None of
 * these touch pg_dump or TRUNCATE — that heavy, irreversible work only
 * ever happens in scripts/runDatabaseWipe.js on GitHub Actions
 * (Rule 40.1's "decoupled from live traffic" pattern), never here.
 *
 * DATA FLOW:
 * 1. app/api/superAdmin/wipe/route.js POST   -> initiateWipeRequest()
 * 2. app/api/superAdmin/wipe/route.js GET    -> getActiveWipeRequest(),
 *    and markAutoDispatched() once that request goes due+confirmed —
 *    see that route for why the app proactively fires the executor
 *    workflow itself instead of only ever relying on GitHub's own
 *    15-minute cron (a non-technical owner should never need anyone to
 *    manually press "Run workflow" in GitHub for this to happen)
 * 3. app/api/superAdmin/wipe/route.js DELETE -> cancelWipeRequest()
 * 4. app/api/superAdmin/wipe/confirm/route.js PATCH -> confirmWipeContinue()
 * 5. scripts/runDatabaseWipe.js reads DatabaseWipeRequest rows directly
 *    via its own PrismaClient instance (same reasoning as
 *    scripts/runBackup.js) — it does not import these helpers.
 */
import { prisma } from "@/services/prisma";

// How long a super-admin has to cancel before the wipe is allowed to
// execute at all.
export const WIPE_GRACE_PERIOD_HOURS = 24;

// How much time remaining triggers the non-dismissible final-warning
// modal (DatabaseWipeGraceModal) on every super-admin page.
export const WIPE_FINAL_WARNING_HOURS = 2;

/**
 * getActiveWipeRequest
 * Returns the single outstanding ("pending") wipe request, or null if
 * none exists. "Active" here means still awaiting either its grace
 * period to elapse or the final confirmation modal — cancelled,
 * completed, and failed rows are never returned, so the UI treats them
 * as if they no longer exist once resolved.
 */
export async function getActiveWipeRequest() {
  return prisma.databaseWipeRequest.findFirst({
    where: { status: "pending" },
    orderBy: { requestedAt: "desc" },
  });
}

/**
 * initiateWipeRequest
 * Creates a new wipe request scheduled WIPE_GRACE_PERIOD_HOURS from
 * now. Refuses to create a second one if a pending request already
 * exists — the super-admin must cancel the existing one first, so
 * there's never ambiguity about which request's grace period is
 * actually counting down.
 *
 * @param {string} requestedBy - AdminProfile.id of the super-admin
 * @param {"with_backup"|"without_backup"} backupOption - the super-
 *   admin's own choice, never forced toward either option
 */
export async function initiateWipeRequest(requestedBy, backupOption) {
  const existing = await getActiveWipeRequest();
  if (existing) {
    return {
      success: false,
      message: "A wipe is already scheduled. Cancel it first if you want to change anything.",
    };
  }

  const requestedAt = new Date();
  const scheduledAt = new Date(requestedAt.getTime() + WIPE_GRACE_PERIOD_HOURS * 60 * 60 * 1000);

  const wipeRequest = await prisma.databaseWipeRequest.create({
    data: { status: "pending", backupOption, requestedBy, requestedAt, scheduledAt },
  });

  return { success: true, data: wipeRequest };
}

/**
 * cancelWipeRequest
 * Marks the active wipe request as cancelled. Callable at any point
 * during the grace period, including from inside the blocking 2-hour
 * modal's "Don't continue" button — cancelling stays allowed right up
 * until the executor script actually runs (it only ever picks up rows
 * still in "pending" status with finalConfirmedAt set).
 *
 * @param {string} cancelledBy - AdminProfile.id of whoever cancelled
 */
export async function cancelWipeRequest(cancelledBy) {
  const existing = await getActiveWipeRequest();
  if (!existing) {
    return { success: false, message: "There's no scheduled wipe to cancel." };
  }

  await prisma.databaseWipeRequest.update({
    where: { id: existing.id },
    data: { status: "cancelled", cancelledAt: new Date(), cancelledBy },
  });

  return { success: true };
}

/**
 * confirmWipeContinue
 * Records the super-admin's explicit "Continue" choice from the
 * blocking grace-period modal. This is the last human checkpoint
 * before the executor script is allowed to touch anything — a request
 * that reaches scheduledAt without this set is left pending forever
 * (see the model's own comment) rather than proceeding unattended.
 */
export async function confirmWipeContinue() {
  const existing = await getActiveWipeRequest();
  if (!existing) {
    return { success: false, message: "There's no scheduled wipe to confirm." };
  }

  const updated = await prisma.databaseWipeRequest.update({
    where: { id: existing.id },
    data: { finalConfirmedAt: new Date() },
  });

  return { success: true, data: updated };
}

/**
 * markAutoDispatched
 * Records that the app itself already fired a workflow_dispatch for
 * this request (see GET /api/superAdmin/wipe) — stops the 30-second
 * status poll from dispatching the same executor run over and over
 * while the request sits due+confirmed waiting for GitHub's runner
 * queue. Never resets — a request only ever needs this once.
 */
export async function markAutoDispatched(requestId) {
  await prisma.databaseWipeRequest.update({
    where: { id: requestId },
    data: { autoDispatchedAt: new Date() },
  });
}

/**
 * truncateNow
 * Bypasses the 24-hour grace period entirely — the super-admin's own
 * explicit "Truncate Now" choice, gated behind its own typed
 * confirmation (see app/api/superAdmin/wipe/truncate-now/route.js).
 * Sets scheduledAt AND finalConfirmedAt to the current instant, which
 * is the same "due and confirmed" shape the executor script already
 * looks for — no separate code path in scripts/runDatabaseWipe.js is
 * needed, this just makes the existing request immediately eligible.
 * The route handler still has to remotely dispatch the executor
 * workflow right after this, otherwise the wipe would only actually
 * run whenever the next 15-minute scheduled check happens to land.
 */
export async function truncateNow() {
  const existing = await getActiveWipeRequest();
  if (!existing) {
    return { success: false, message: "There's no scheduled wipe to truncate." };
  }

  const now = new Date();
  const updated = await prisma.databaseWipeRequest.update({
    where: { id: existing.id },
    data: { scheduledAt: now, finalConfirmedAt: now },
  });

  return { success: true, data: updated };
}
