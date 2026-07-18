/**
 * FILE: app/api/superAdmin/wipe/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Powers the "Wipe Database" danger-zone section on the Backups page.
 * All three handlers here only ever create/read/cancel a
 * DatabaseWipeRequest row — none of them run TRUNCATE or pg_dump
 * themselves. The actual destructive work happens later, decoupled, on
 * GitHub Actions (scripts/runDatabaseWipe.js), same pattern as backups
 * (Rule 40.1).
 *
 * DATA FLOW:
 * 1. POST   - super-admin confirms the danger-zone modal (choice +
 *             typed "WIPE DATABASE") -> schedules a wipe 24 hours out
 * 2. GET    - polled by WipeDatabaseSection (Backups page) and
 *             DatabaseWipeGraceModal (every authenticated page) to
 *             show the countdown / trigger the blocking final-warning modal
 * 3. DELETE - cancels the active request, at any point in the grace period
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/services/adminSession";
import {
  initiateWipeRequest,
  cancelWipeRequest,
  getActiveWipeRequest,
  markAutoDispatched,
  WIPE_FINAL_WARNING_HOURS,
} from "@/services/databaseWipeRequest";
import { triggerWorkflowDispatch } from "@/services/github";
import { logSecurityEvent } from "@/services/securityLog";

const initiateSchema = z.object({
  backupOption: z.enum(["with_backup", "without_backup"]),
  // Typed confirmation the danger-zone modal requires before its own
  // Confirm button even enables — re-checked here server-side too,
  // never trusted client-only, for a destructive action of this size.
  confirmationText: z.literal("WIPE DATABASE"),
});

export async function POST(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  let payload;
  try {
    payload = initiateSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: 'Type "WIPE DATABASE" exactly and choose a backup option.' },
      { status: 400 }
    );
  }

  let result;
  try {
    result = await initiateWipeRequest(session.uid, payload.backupOption);
  } catch (error) {
    // A thrown (not returned) error here would otherwise crash the
    // route into an HTML error page — never JSON — which is what makes
    // the frontend fall back to its generic "server returned an error"
    // toast instead of a real message. Catch it, log the real reason
    // server-side, and still respond with valid JSON.
    console.error("[api/superAdmin/wipe POST] initiateWipeRequest failed:", error);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to schedule the wipe. Please try again.", error: error.message },
      { status: 500 }
    );
  }

  // Logged regardless of outcome — an admin repeatedly attempting to
  // schedule a second wipe while one is already pending is itself
  // worth a trail entry.
  await logSecurityEvent({
    eventType: "admin_action",
    actor: session.uid,
    request,
    details: result.success
      ? `Scheduled a database wipe (${
          payload.backupOption === "with_backup" ? "with backup" : "WITHOUT backup"
        }), executing in 24 hours unless cancelled.`
      : "Attempted to schedule a database wipe but one was already pending.",
  });

  if (!result.success) {
    return NextResponse.json({ success: false, data: null, message: result.message }, { status: 409 });
  }

  // Immediate "moment of scheduling" backup — the super-admin chose
  // "Back up first, then wipe", so a copy of the current data should
  // land in R2 + Google Drive right now, not only right before the
  // TRUNCATE runs 24 hours later. Dispatches pre-wipe-backup.yml,
  // which runs the exact same scripts/runBackup.js as the nightly
  // workflow (same pg_dump + dual-upload + BackupLog write, decoupled
  // on GitHub's own runners per Rule 40.1) — it's a separate workflow
  // FILE only so this run shows up under its own name in the Actions
  // tab instead of mixed into "Nightly Database Backup" history. This
  // is best-effort and never blocks the schedule itself: the real
  // safety gate is still the pre-wipe backup runDatabaseWipe.js takes
  // right before truncating — if that later backup fails, the wipe
  // still aborts regardless of whether this immediate one succeeded.
  let immediateBackupDispatched = false;
  if (payload.backupOption === "with_backup") {
    try {
      await triggerWorkflowDispatch("pre-wipe-backup.yml", {});
      immediateBackupDispatched = true;
    } catch (error) {
      console.error("[api/superAdmin/wipe POST] Immediate backup dispatch failed:", error.message);
    }
  }

  return NextResponse.json({
    success: true,
    data: result.data,
    message:
      payload.backupOption === "with_backup"
        ? immediateBackupDispatched
          ? "Wipe scheduled for 24 hours from now. A backup is being created now and will also appear in R2 and Google Drive shortly."
          : "Wipe scheduled, but the immediate backup couldn't be triggered (check GITHUB_ACTIONS_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME). A backup will still be attempted right before the wipe runs."
        : "Wipe scheduled for 24 hours from now. You can cancel it any time before then.",
  });
}

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  let activeRequest;
  try {
    activeRequest = await getActiveWipeRequest();
  } catch (error) {
    console.error("[api/superAdmin/wipe GET] getActiveWipeRequest failed:", error);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load wipe status. Please try again.", error: error.message },
      { status: 500 }
    );
  }

  if (!activeRequest) {
    return NextResponse.json({ success: true, data: null, message: "No wipe scheduled." });
  }

  const now = new Date();
  const millisecondsRemaining = Math.max(0, new Date(activeRequest.scheduledAt).getTime() - now.getTime());
  const hoursRemaining = millisecondsRemaining / (60 * 60 * 1000);

  // Proactive dispatch — the owner is not a programmer and should
  // never need to open GitHub Actions or wait on its own 15-minute
  // `schedule:` cron (which requires the workflow file to be on the
  // repo's default branch, and can take a while to start firing after
  // being added). Every authenticated admin page polls this endpoint
  // every 30 seconds, so the instant a request is both due
  // (scheduledAt has passed) and confirmed (the owner already clicked
  // "Continue" on the 2-hour grace modal), fire the executor directly
  // via the same workflow_dispatch API call "Truncate Now" uses.
  // markAutoDispatched() stops this from firing again on every
  // subsequent poll. Best-effort: if this fails (e.g. GitHub API
  // hiccup), GitHub's own cron is still the fallback safety net — a
  // failed dispatch attempt here must never break the status response
  // the whole Backups page and grace modal depend on.
  const isDueAndConfirmed =
    activeRequest.status === "pending" &&
    activeRequest.finalConfirmedAt !== null &&
    now >= new Date(activeRequest.scheduledAt);

  if (isDueAndConfirmed && !activeRequest.autoDispatchedAt) {
    try {
      await triggerWorkflowDispatch("database-wipe-executor.yml", {});
      await markAutoDispatched(activeRequest.id);
      activeRequest.autoDispatchedAt = now;
      await logSecurityEvent({
        eventType: "admin_action",
        actor: "system",
        request,
        details: "Automatically dispatched the database wipe executor — the scheduled wipe is now due and confirmed.",
      });
    } catch (error) {
      console.error("[api/superAdmin/wipe] Proactive auto-dispatch failed:", error.message);
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      ...activeRequest,
      millisecondsRemaining,
      // The blocking grace modal (DatabaseWipeGraceModal) shows the
      // instant this flips true and stays showing until the super-
      // admin resolves it — see that component's own header.
      shouldShowFinalWarning: hoursRemaining <= WIPE_FINAL_WARNING_HOURS && !activeRequest.finalConfirmedAt,
    },
  });
}

export async function DELETE(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  let result;
  try {
    result = await cancelWipeRequest(session.uid);
  } catch (error) {
    console.error("[api/superAdmin/wipe DELETE] cancelWipeRequest failed:", error);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to cancel the wipe. Please try again.", error: error.message },
      { status: 500 }
    );
  }

  await logSecurityEvent({
    eventType: "admin_action",
    actor: session.uid,
    request,
    details: result.success
      ? "Cancelled the scheduled database wipe."
      : "Attempted to cancel a database wipe but none was pending.",
  });

  if (!result.success) {
    return NextResponse.json({ success: false, data: null, message: result.message }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: null, message: "Wipe cancelled." });
}
