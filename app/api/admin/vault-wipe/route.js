/**
 * FILE: app/api/admin/vault-wipe/route.js
 * ROLE: Vault-session only (requireVaultSession) — excluded from
 *       proxy.js's blanket /api/admin super_admin gate via
 *       VAULT_STANDALONE_API_PATHS. Never checks requireSuperAdmin().
 *
 * PURPOSE:
 * The vault recovery page's own "Danger Zone" — mirrors
 * app/api/superAdmin/wipe/route.js exactly (same
 * services/databaseWipeRequest.js helpers, same
 * DatabaseWipeRequest row, same GitHub Actions executor), but reached
 * entirely through the standalone vault passphrase + emailed OTP
 * chain instead of the regular super-admin session. This exists
 * because the vault is designed to work even when the regular
 * super-admin session/cookie is unavailable or untrusted (mid-breach),
 * so the Danger Zone must be reachable from there too — otherwise a
 * wipe scheduled during a real incident would depend on a session the
 * incident might itself be compromising.
 *
 * Scheduling (POST) additionally requires a fresh step-up code — see
 * request-code/route.js — checked the same way blocked-ips/unban does.
 * GET (status poll) and DELETE (cancel) do not require a step-up code:
 * reading status is harmless, and cancelling only ever makes the
 * outcome safer, same reasoning as "End Lockdown" not requiring one.
 *
 * DATA FLOW:
 * 1. POST   - vault owner confirms the danger-zone modal (choice +
 *             typed "WIPE DATABASE" + fresh step-up code) -> schedules
 *             a wipe 24 hours out
 * 2. GET    - polled by VaultDangerZoneSection and VaultWipeGraceModal
 *             to show the countdown / trigger the blocking final-
 *             warning modal, mirroring the superAdmin GET handler's
 *             proactive auto-dispatch logic exactly
 * 3. DELETE - cancels the active request, at any point in the grace period
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVaultSession } from "@/services/vaultAuth";
import { verifyVaultOtp } from "@/services/vaultOtp";
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
  confirmationText: z.literal("WIPE DATABASE"),
  // The fresh step-up code emailed by request-code/route.js — re-checked
  // here server-side, never trusted client-only, same as unban's code.
  code: z.string().min(1),
});

function requireOtpVerifiedVaultSession(request) {
  const vaultSession = requireVaultSession(request);
  return vaultSession?.otpVerified ? vaultSession : null;
}

export async function POST(request) {
  const vaultSession = requireOtpVerifiedVaultSession(request);
  if (!vaultSession) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  let payload;
  try {
    payload = initiateSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: 'Type "WIPE DATABASE" exactly, choose a backup option, and enter the emailed code.' },
      { status: 400 }
    );
  }

  const { verified, reason } = await verifyVaultOtp(payload.code);
  if (!verified) {
    await logSecurityEvent({
      eventType: "admin_login_denied",
      actor: vaultSession.uid,
      request,
      details: `Vault wipe schedule denied — step-up code invalid (${reason ?? "unknown reason"}).`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Incorrect or expired code." },
      { status: 401 }
    );
  }

  let result;
  try {
    result = await initiateWipeRequest(vaultSession.uid, payload.backupOption);
  } catch (error) {
    console.error("[api/admin/vault-wipe POST] initiateWipeRequest failed:", error);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to schedule the wipe. Please try again.", error: error.message },
      { status: 500 }
    );
  }

  await logSecurityEvent({
    eventType: "admin_action",
    actor: vaultSession.uid,
    request,
    details: result.success
      ? `Scheduled a database wipe via vault recovery (${
          payload.backupOption === "with_backup" ? "with backup" : "WITHOUT backup"
        }), executing in 24 hours unless cancelled.`
      : "Attempted to schedule a database wipe via vault recovery but one was already pending.",
  });

  if (!result.success) {
    return NextResponse.json({ success: false, data: null, message: result.message }, { status: 409 });
  }

  let immediateBackupDispatched = false;
  if (payload.backupOption === "with_backup") {
    try {
      await triggerWorkflowDispatch("pre-wipe-backup.yml", {});
      immediateBackupDispatched = true;
    } catch (error) {
      console.error("[api/admin/vault-wipe POST] Immediate backup dispatch failed:", error.message);
    }
  }

  return NextResponse.json({
    success: true,
    data: result.data,
    message:
      payload.backupOption === "with_backup"
        ? immediateBackupDispatched
          ? "Wipe scheduled for 24 hours from now. A backup is being created now and will also appear in R2 and Google Drive shortly."
          : "Wipe scheduled, but the immediate backup couldn't be triggered. A backup will still be attempted right before the wipe runs."
        : "Wipe scheduled for 24 hours from now. You can cancel it any time before then.",
  });
}

export async function GET(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  let activeRequest;
  try {
    activeRequest = await getActiveWipeRequest();
  } catch (error) {
    console.error("[api/admin/vault-wipe GET] getActiveWipeRequest failed:", error);
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

  // Same proactive-dispatch reasoning as app/api/superAdmin/wipe/route.js's
  // GET handler — the vault owner should never need GitHub Actions itself
  // to notice this request is due+confirmed.
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
        details: "Automatically dispatched the database wipe executor (vault-scheduled request) — the scheduled wipe is now due and confirmed.",
      });
    } catch (error) {
      console.error("[api/admin/vault-wipe] Proactive auto-dispatch failed:", error.message);
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      ...activeRequest,
      millisecondsRemaining,
      shouldShowFinalWarning: hoursRemaining <= WIPE_FINAL_WARNING_HOURS && !activeRequest.finalConfirmedAt,
    },
  });
}

export async function DELETE(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  let result;
  try {
    result = await cancelWipeRequest(vaultSession.uid);
  } catch (error) {
    console.error("[api/admin/vault-wipe DELETE] cancelWipeRequest failed:", error);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to cancel the wipe. Please try again.", error: error.message },
      { status: 500 }
    );
  }

  await logSecurityEvent({
    eventType: "admin_action",
    actor: vaultSession.uid,
    request,
    details: result.success
      ? "Cancelled the scheduled database wipe via vault recovery."
      : "Attempted to cancel a database wipe via vault recovery but none was pending.",
  });

  if (!result.success) {
    return NextResponse.json({ success: false, data: null, message: result.message }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: null, message: "Wipe cancelled." });
}
