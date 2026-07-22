/**
 * FILE: app/api/superAdmin/settings/vault-passphrase/test-recovery-channels/route.js
 * ROLE: Owner only — same reasoning as the sibling
 *       app/api/superAdmin/settings/vault-passphrase/route.js: this
 *       reports on the health of the vault's own recovery
 *       infrastructure (GitHub Actions, Google Drive, EmailJS), so a
 *       plain requireSuperAdmin() isn't strict enough. A non-owner
 *       staff account gets a plain 404, same as its sibling route, so
 *       probing this URL directly can't even confirm the vault system
 *       exists.
 *
 * PURPOSE:
 * POST -> runs services/recoveryChannelTester.js's four dry-run checks
 * (GitHub token validity, Drive refresh-token validity, EmailJS config
 * presence, and a real secondary-webhook test alert) and returns
 * per-channel pass/fail results. Never rotates the passphrase, never
 * uploads a real backup file, never dispatches a workflow, and never
 * sends a real EmailJS email — see that file's header for exactly what
 * each check does.
 *
 * Always logged as an admin_action, regardless of outcome, so a
 * pattern of repeated failures (e.g. a token that's been dead for
 * weeks) shows up in the Security Logs audit trail too, not just in
 * this one-off response.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";
import { runRecoveryChannelTests } from "@/services/recoveryChannelTester";

export async function POST(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  const adminProfile = await prisma.adminProfile.findUnique({
    where: { id: session.uid },
    select: { isOwner: true },
  });
  if (!adminProfile?.isOwner) {
    return NextResponse.json({ success: false, data: null, message: "Not found." }, { status: 404 });
  }

  try {
    const result = await runRecoveryChannelTests();

    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Ran Test Recovery Channels — ${result.passedCount}/${result.totalCount} channels passed.`,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: result.allPassed
        ? `All ${result.totalCount} recovery channels are working.`
        : `${result.passedCount}/${result.totalCount} recovery channels are working — see details below.`,
    });
  } catch (error) {
    console.error("[testRecoveryChannels] Failed to run checks:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't run the recovery channel tests. Please try again.", error: error.message },
      { status: 500 }
    );
  }
}
