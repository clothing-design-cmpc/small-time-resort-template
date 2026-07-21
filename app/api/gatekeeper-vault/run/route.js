/**
 * FILE: app/api/gatekeeper-vault/run/route.js
 * ROLE: Gated ONLY by "gatekeeperVaultSession" (requireGatekeeperVaultSession)
 *       — a regular super_admin session cookie is never enough here.
 *       Replaces the old app/api/superAdmin/gatekeeper-tester/route.js,
 *       which required a super_admin session instead.
 *
 * PURPOSE:
 * POST -> runs a live dry run of Gatekeeper 1 (login brute force) and
 * Gatekeeper 2 (booking SQL injection) against this same deployment,
 * using the shared core in services/gatekeeperTester.js. Always logs
 * a security event, since this deliberately trips real breach
 * detectors and briefly flips the site into lockdown (cleanup always
 * restores the prior state — see that file's docblock).
 *
 * *** NEVER trigger this against a deployment real visitors are
 * actively using *** — same warning as scripts/checkGatekeepers.js.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireGatekeeperVaultSession, GATEKEEPER_VAULT_IDENTITY } from "@/services/gatekeeperVaultAuth";
import { logSecurityEvent } from "@/services/securityLog";
import { runGatekeeperDryRun } from "@/services/gatekeeperTester";

export async function POST(request) {
  const session = requireGatekeeperVaultSession(request);
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
      actor: GATEKEEPER_VAULT_IDENTITY,
      request,
      details: `Ran Gatekeeper dry run from the hidden vault — ${result.passedCount}/${result.totalCount} checks passed (test IPs: ${result.testIp1}, ${result.testIp2}).`,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: result.allPassed
        ? `All ${result.totalCount} checks passed.`
        : `${result.passedCount}/${result.totalCount} checks passed — see results below.`,
    });
  } catch (error) {
    console.error("[GatekeeperVault] Dry run failed:", error);
    return NextResponse.json(
      { success: false, data: null, message: "The dry run couldn't complete. Please try again.", error: error.message },
      { status: 500 }
    );
  }
}
