/**
 * FILE: app/api/superAdmin/gatekeeper-tester/route.js
 * ROLE: Super-admin only — checked directly with requireSuperAdmin(),
 * since middleware.js's matcher covers /superAdmin/* pages, not /api/*.
 *
 * PURPOSE:
 * POST -> runs a live dry run of Gatekeeper 1 (login brute force) and
 * Gatekeeper 2 (booking SQL injection) against this same deployment,
 * using the shared core in services/gatekeeperTester.js. Always logs
 * an admin_action security event, since this deliberately trips real
 * breach detectors and briefly flips the site into lockdown (cleanup
 * always restores the prior state — see that file's docblock).
 *
 * *** NEVER trigger this against a deployment real visitors are
 * actively using *** — same warning as scripts/checkGatekeepers.js.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";
import { runGatekeeperDryRun } from "@/services/gatekeeperTester";

export async function POST(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    // This app itself is the target — always its own origin, never a
    // value the client could redirect elsewhere.
    const baseUrl = new URL(request.url).origin;

    const result = await runGatekeeperDryRun({
      baseUrl,
      testIp1: typeof body.testIp1 === "string" ? body.testIp1 : undefined,
      testIp2: typeof body.testIp2 === "string" ? body.testIp2 : undefined,
    });

    // Audit trail — this deliberately trips breach detectors, so it's
    // always logged regardless of how many checks passed.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Ran Gatekeeper dry run — ${result.passedCount}/${result.totalCount} checks passed (test IPs: ${result.testIp1}, ${result.testIp2}).`,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: result.allPassed
        ? `All ${result.totalCount} checks passed.`
        : `${result.passedCount}/${result.totalCount} checks passed — see results below.`,
    });
  } catch (error) {
    console.error("[GatekeeperTester] Dry run failed:", error);
    return NextResponse.json(
      { success: false, data: null, message: "The dry run couldn't complete. Please try again.", error: error.message },
      { status: 500 }
    );
  }
}
