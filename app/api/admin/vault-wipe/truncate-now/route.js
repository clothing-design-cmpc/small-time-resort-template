/**
 * FILE: app/api/admin/vault-wipe/truncate-now/route.js
 * ROLE: Vault-session only (requireVaultSession, otpVerified) —
 *       excluded from proxy.js's blanket /api/admin super_admin gate
 *       via VAULT_STANDALONE_API_PATHS.
 *
 * PURPOSE:
 * Vault-recovery mirror of app/api/superAdmin/wipe/truncate-now/route.js.
 * Bypasses the remaining grace period on an already vault-scheduled
 * wipe. Gated behind BOTH its own typed confirmation ("TRUNCATE NOW")
 * AND a fresh step-up code (see request-code/route.js) — skipping the
 * entire wait is the single biggest action in the app, so it gets the
 * strictest gate available.
 *
 * DATA FLOW:
 * 1. Validates the typed confirmation text and the step-up code
 * 2. truncateNow() sets scheduledAt AND finalConfirmedAt to now —
 *    same "due and confirmed" shape scripts/runDatabaseWipe.js expects
 * 3. Immediately dispatches database-wipe-executor.yml
 * 4. Logs a security event either way
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVaultSession } from "@/services/vaultAuth";
import { verifyVaultOtp } from "@/services/vaultOtp";
import { truncateNow } from "@/services/databaseWipeRequest";
import { triggerWorkflowDispatch } from "@/services/github";
import { logSecurityEvent } from "@/services/securityLog";

const truncateNowSchema = z.object({
  confirmationText: z.literal("TRUNCATE NOW"),
  code: z.string().min(1),
});

export async function POST(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  let payload;
  try {
    payload = truncateNowSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: 'Type "TRUNCATE NOW" exactly and enter the emailed code.' },
      { status: 400 }
    );
  }

  const { verified, reason } = await verifyVaultOtp(payload.code);
  if (!verified) {
    await logSecurityEvent({
      eventType: "admin_login_denied",
      actor: vaultSession.uid,
      request,
      details: `Vault truncate-now denied — step-up code invalid (${reason ?? "unknown reason"}).`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Incorrect or expired code." },
      { status: 401 }
    );
  }

  let result;
  try {
    result = await truncateNow();
  } catch (error) {
    console.error("[api/admin/vault-wipe/truncate-now POST] truncateNow failed:", error);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to truncate now. Please try again.", error: error.message },
      { status: 500 }
    );
  }

  if (!result.success) {
    await logSecurityEvent({
      eventType: "admin_action",
      actor: vaultSession.uid,
      request,
      details: "Attempted to bypass the vault wipe grace period but no wipe was pending.",
    });
    return NextResponse.json({ success: false, data: null, message: result.message }, { status: 404 });
  }

  let dispatchSucceeded = true;
  try {
    await triggerWorkflowDispatch("database-wipe-executor.yml", {});
  } catch (error) {
    dispatchSucceeded = false;
    console.error("[api/admin/vault-wipe/truncate-now] Failed to dispatch executor workflow:", error.message);
  }

  await logSecurityEvent({
    eventType: "admin_action",
    actor: vaultSession.uid,
    request,
    details: `Bypassed the vault wipe grace period (backupOption: ${result.data.backupOption}) — ${
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
      : "Couldn't trigger it instantly. It's still scheduled and will run automatically within 15 minutes.",
  });
}
