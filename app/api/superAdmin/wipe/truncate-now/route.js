/**
 * FILE: app/api/superAdmin/wipe/truncate-now/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin()
 *
 * PURPOSE:
 * Lets the super-admin bypass the 24-hour grace period on an already-
 * scheduled wipe and run it immediately. Gated behind its own typed
 * confirmation ("TRUNCATE NOW") — separate from the one used to
 * schedule the wipe in the first place, since skipping every waiting
 * period is a bigger step than scheduling one.
 *
 * DATA FLOW:
 * 1. Validates the typed confirmation text
 * 2. truncateNow() sets scheduledAt AND finalConfirmedAt to now on the
 *    active request — the same "due and confirmed" shape
 *    scripts/runDatabaseWipe.js already looks for
 * 3. Immediately dispatches database-wipe-executor.yml via
 *    services/github.js so the wipe runs within seconds instead of
 *    waiting for the next 15-minute scheduled check. If that dispatch
 *    call fails (bad GITHUB_ACTIONS_TOKEN, wrong GITHUB_REPO_OWNER/
 *    GITHUB_REPO_NAME, etc.) the request is still left due+confirmed
 *    in the DB, so the 15-minute cron eventually runs it regardless —
 *    but the admin is told honestly that the instant trigger didn't
 *    fire, instead of always claiming "finishes within a minute"
 * 4. Logs a security event — bypassing the grace period is exactly
 *    the kind of action that belongs in the audit trail
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/services/adminSession";
import { truncateNow } from "@/services/databaseWipeRequest";
import { triggerWorkflowDispatch } from "@/services/github";
import { logSecurityEvent } from "@/services/securityLog";

const truncateNowSchema = z.object({
  confirmationText: z.literal("TRUNCATE NOW"),
});

export async function POST(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    truncateNowSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: 'Type "TRUNCATE NOW" exactly to confirm.' },
      { status: 400 }
    );
  }

  const result = await truncateNow();

  if (!result.success) {
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: "Attempted to bypass the wipe grace period but no wipe was pending.",
    });
    return NextResponse.json({ success: false, data: null, message: result.message }, { status: 404 });
  }

  // The DB row is already due+confirmed regardless of what happens
  // below, so the 15-minute scheduled check will eventually pick it up
  // even if this instant-dispatch call fails — but the admin still
  // needs to be told honestly whether it fired instantly or not,
  // rather than always hearing "finishes within a minute."
  let dispatchSucceeded = true;
  try {
    await triggerWorkflowDispatch("database-wipe-executor.yml", {});
  } catch (error) {
    dispatchSucceeded = false;
    console.error("[api/superAdmin/wipe/truncate-now] Failed to dispatch executor workflow:", error.message);
  }

  await logSecurityEvent({
    eventType: "admin_action",
    actor: session.uid,
    request,
    details: `Bypassed the wipe grace period (backupOption: ${result.data.backupOption}) — ${
      dispatchSucceeded
        ? "truncating immediately."
        : "instant trigger failed (see server logs), will run on the next scheduled check instead."
    }`,
  });

  return NextResponse.json({
    success: true,
    data: result.data,
    message: dispatchSucceeded
      ? "Truncating now. This usually finishes within a minute."
      : "Couldn't trigger it instantly — check GITHUB_ACTIONS_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME. It's still scheduled and will run automatically within 15 minutes.",
  });
}
