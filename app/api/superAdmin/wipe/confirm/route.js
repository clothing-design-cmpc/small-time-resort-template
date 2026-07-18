/**
 * FILE: app/api/superAdmin/wipe/confirm/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin()
 *
 * PURPOSE:
 * Handles the "Continue" button on the blocking grace-period modal
 * (components/superAdmin/DatabaseWipeGraceModal.jsx), shown once a
 * scheduled wipe has 2 hours or less remaining. "Don't continue" reuses
 * the existing DELETE /api/superAdmin/wipe instead of duplicating that
 * logic here — this route only ever records the confirmation.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { confirmWipeContinue } from "@/services/databaseWipeRequest";
import { logSecurityEvent } from "@/services/securityLog";

export async function PATCH(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  let result;
  try {
    result = await confirmWipeContinue();
  } catch (error) {
    console.error("[api/superAdmin/wipe/confirm PATCH] confirmWipeContinue failed:", error);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to confirm the wipe. Please try again.", error: error.message },
      { status: 500 }
    );
  }

  await logSecurityEvent({
    eventType: "admin_action",
    actor: session.uid,
    request,
    details: result.success
      ? 'Confirmed "Continue" on the final database wipe warning — wipe will proceed as scheduled.'
      : "Attempted to confirm a database wipe but none was pending.",
  });

  if (!result.success) {
    return NextResponse.json({ success: false, data: null, message: result.message }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: result.data, message: "Confirmed. The wipe will proceed as scheduled." });
}
