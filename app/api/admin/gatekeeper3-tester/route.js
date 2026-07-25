/**
 * FILE: app/api/admin/gatekeeper3-tester/route.js
 * ROLE: Vault-session only (requireVaultSession + otpVerified) —
 *       excluded from proxy.js's blanket /api/admin super_admin gate
 *       via VAULT_STANDALONE_API_PATHS, same pattern as
 *       /api/admin/gatekeeper-tester.
 *
 * PURPOSE:
 * POST -> runs a LIVE test of Gatekeeper 3 (anomalous admin login)
 * against this same deployment, using the shared core in
 * services/gatekeeper3Tester.js. Unlike gatekeeper-tester (GK1/GK2),
 * this is NOT a harmless dry run — it actually flips the site into
 * full lockdown and rotates the real vault passphrase. See that
 * service file's docblock for the complete list of real, lasting
 * side effects.
 *
 * *** NEVER trigger this against a deployment real visitors are
 * actively using. *** Same warning as gatekeeper-tester, but stronger:
 * this one does not clean up after itself — the lockdown stays on
 * until a super-admin manually ends it.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireVaultSession } from "@/services/vaultAuth";
import { logSecurityEvent } from "@/services/securityLog";
import { runGatekeeper3Test } from "@/services/gatekeeper3Tester";

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

    const result = await runGatekeeper3Test({
      baseUrl,
      testIp: typeof body.testIp === "string" ? body.testIp : undefined,
    });

    // Audit trail — always logged, since this deliberately trips a
    // real breach response that leaves the site locked down. Same
    // actor convention every other Danger Zone / vault action uses.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: vaultSession.uid,
      request,
      details: `Ran Gatekeeper 3 live test from the vault — ${result.passedCount}/${result.totalCount} checks passed (test IP: ${result.testIp}). Site-wide lockdown was NOT reverted automatically.`,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: result.allPassed
        ? `All ${result.totalCount} checks passed. The site is now in real breach lockdown — end it manually from the dashboard when you're done reviewing.`
        : `${result.passedCount}/${result.totalCount} checks passed — see results below.`,
    });
  } catch (error) {
    console.error("[Gatekeeper3Tester] Live test failed:", error);
    return NextResponse.json(
      { success: false, data: null, message: "The test couldn't complete. Please try again.", error: error.message },
      { status: 500 }
    );
  }
}
