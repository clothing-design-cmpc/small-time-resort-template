/**
 * FILE: app/api/admin/gatekeeper-tester/route.js
 * ROLE: Vault-session only (requireVaultSession + otpVerified) —
 *       excluded from proxy.js's blanket /api/admin super_admin gate
 *       via VAULT_STANDALONE_API_PATHS. Never checks requireSuperAdmin()
 *       and never accepts a regular admin session — only someone who
 *       has actually solved the vault's own passphrase + OTP chain can
 *       reach this route. Replaces the earlier standalone
 *       app/api/gatekeeper-vault/run/route.js, which used its own
 *       separate passphrase and hidden URL instead of living inside
 *       this same vault.
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
import { requireVaultSession } from "@/services/vaultAuth";
import { logSecurityEvent } from "@/services/securityLog";
import { runGatekeeperDryRun } from "@/services/gatekeeperTester";

export async function POST(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
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
    // always logged regardless of how many checks passed. Same actor
    // convention every other Danger Zone / vault action already uses.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: vaultSession.uid,
      request,
      details: `Ran Gatekeeper dry run from the vault — ${result.passedCount}/${result.totalCount} checks passed (test IPs: ${result.testIp1}, ${result.testIp2}).`,
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
