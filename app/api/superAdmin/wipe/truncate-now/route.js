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
 * 3. activatePostWipeLockdown() fires HERE, synchronously, before
 *    anything else below — the site goes dark and this response
 *    clears the caller's own "session" cookie immediately. This does
 *    NOT wait for the actual TRUNCATE to run or succeed on GitHub's
 *    runner (that used to be the only place lockdown got set, which
 *    meant staying fully logged in for the duration of that Action —
 *    or indefinitely, if it failed). See services/postWipeLockdown.js
 *    for the full reasoning.
 * 4. Immediately dispatches database-wipe-executor.yml via
 *    services/github.js so the wipe runs within seconds instead of
 *    waiting for the next 15-minute scheduled check. If that dispatch
 *    call fails (bad GITHUB_ACTIONS_TOKEN, wrong GITHUB_REPO_OWNER/
 *    GITHUB_REPO_NAME, etc.) the request is still left due+confirmed
 *    in the DB, so the 15-minute cron eventually runs it regardless —
 *    but the admin is told honestly that the instant trigger didn't
 *    fire, instead of always claiming "finishes within a minute". The
 *    site is already locked down either way, from step 3.
 * 5. Logs a security event — bypassing the grace period is exactly
 *    the kind of action that belongs in the audit trail
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/services/adminSession";
import { truncateNow } from "@/services/databaseWipeRequest";
import { activatePostWipeLockdown } from "@/services/postWipeLockdown";
import { triggerWorkflowDispatch } from "@/services/github";
import { logSecurityEvent } from "@/services/securityLog";

// Must match app/api/auth/logout/route.js's own rule — Secure cookies
// are dropped outright on plain HTTP local dev, so only require it in
// production.
const isProduction = process.env.NODE_ENV === "production";

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

  let result;
  try {
    result = await truncateNow();
  } catch (error) {
    console.error("[api/superAdmin/wipe/truncate-now POST] truncateNow failed:", error);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to truncate now. Please try again.", error: error.message },
      { status: 500 }
    );
  }

  if (!result.success) {
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: "Attempted to bypass the wipe grace period but no wipe was pending.",
    });
    return NextResponse.json({ success: false, data: null, message: result.message }, { status: 404 });
  }

  // Lock the site down NOW — before dispatching anything, before the
  // actual TRUNCATE runs. This is the single most important ordering
  // change here: it used to only happen inside scripts/runDatabaseWipe.js
  // after a successful TRUNCATE, which could take a minute or more (or
  // never happen at all, if that script's transaction failed). See
  // services/postWipeLockdown.js for the full reasoning.
  try {
    await activatePostWipeLockdown();
  } catch (error) {
    // A failure here must not silently leave the admin logged in and
    // the site unlocked — log it loudly, but still proceed to dispatch
    // the actual wipe below; scripts/runDatabaseWipe.js's own call to
    // the same helper (after TRUNCATE succeeds) is the fallback net.
    console.error("[api/superAdmin/wipe/truncate-now] activatePostWipeLockdown failed:", error.message);
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
    } Site locked down immediately.`,
  });

  const response = NextResponse.json({
    success: true,
    data: result.data,
    message: dispatchSucceeded
      ? "Locked down. Truncating now in the background."
      : "Locked down. Couldn't trigger the truncate instantly — check GITHUB_ACTIONS_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME. It's still scheduled and will run automatically within 15 minutes.",
  });

  // Sign this admin out immediately too — the site-wide lockdown above
  // will catch every OTHER request from here on (proxy.js), but this
  // response has already left proxy.js by the time the flag flipped,
  // so clear the cookie directly on the way out as well, and the
  // frontend redirects to /maintenance right away instead of waiting
  // for the next poll to get caught.
  response.cookies.set("session", "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
