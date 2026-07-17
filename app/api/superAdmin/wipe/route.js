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
  WIPE_FINAL_WARNING_HOURS,
} from "@/services/databaseWipeRequest";
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

  const result = await initiateWipeRequest(session.uid, payload.backupOption);

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

  return NextResponse.json({
    success: true,
    data: result.data,
    message: "Wipe scheduled for 24 hours from now. You can cancel it any time before then.",
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

  const activeRequest = await getActiveWipeRequest();
  if (!activeRequest) {
    return NextResponse.json({ success: true, data: null, message: "No wipe scheduled." });
  }

  const millisecondsRemaining = Math.max(0, new Date(activeRequest.scheduledAt).getTime() - Date.now());
  const hoursRemaining = millisecondsRemaining / (60 * 60 * 1000);

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

  const result = await cancelWipeRequest(session.uid);

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
