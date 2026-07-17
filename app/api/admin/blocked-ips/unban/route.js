/**
 * FILE: app/api/admin/blocked-ips/unban/route.js
 * ROLE: Vault-session only (requireVaultSession, otpVerified) — excluded
 *       from proxy.js's blanket /api/admin super_admin gate via
 *       VAULT_STANDALONE_API_PATHS.
 *
 * PURPOSE:
 * Step-up re-verification, second half — and the only place a
 * BlockedIp row is ever deleted. Requires BOTH a valid, OTP-verified
 * vault session AND a fresh code from request-unban-code/route.js,
 * checked here via the same verifyVaultOtp() the login screen uses.
 * A hijacked or left-open vault dashboard tab still can't unban
 * anything on its own — it would also need the fresh code, which only
 * arrives in the real owner's inbox.
 *
 * DATA FLOW:
 * 1. UnbanIpModal collects the fresh code and PATCHes here with
 *    { ipAddress, code }
 * 2. verifyVaultOtp(code) — same one-time, hashed, attempt-limited
 *    check services/vaultOtp.js already enforces for login
 * 3. On match: BlockedIp row deleted, SecurityLog entry written
 * 4. On mismatch: nothing is deleted, a denied attempt is logged
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireVaultSession } from "@/services/vaultAuth";
import { verifyVaultOtp } from "@/services/vaultOtp";
import { logSecurityEvent } from "@/services/securityLog";

export async function PATCH(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  const { ipAddress, code } = await request.json();

  if (!ipAddress || !code) {
    return NextResponse.json(
      { success: false, data: null, message: "Missing IP address or verification code." },
      { status: 400 }
    );
  }

  const { verified, reason } = await verifyVaultOtp(code);

  // Step-up check failed — do NOT unban. This is exactly the scenario
  // that protects against a hijacked-but-still-open vault dashboard tab.
  if (!verified) {
    await logSecurityEvent({
      eventType: "admin_login_denied",
      actor: vaultSession.uid,
      request,
      details: `Unban denied for ${ipAddress} — step-up code invalid (${reason ?? "unknown reason"}).`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Incorrect or expired code." },
      { status: 401 }
    );
  }

  try {
    const deleted = await prisma.blockedIp.deleteMany({ where: { ipAddress } });

    if (deleted.count === 0) {
      return NextResponse.json(
        { success: false, data: null, message: "That IP is no longer blocked." },
        { status: 404 }
      );
    }

    await logSecurityEvent({
      eventType: "admin_action",
      actor: vaultSession.uid,
      request,
      details: `Unbanned IP ${ipAddress} via vault recovery page.`,
    });

    return NextResponse.json({
      success: true,
      data: { ipAddress },
      message: `${ipAddress} has been unbanned.`,
    });
  } catch (error) {
    console.error("[api/admin/blocked-ips/unban] Failed to unban:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't unban that IP. Please try again." },
      { status: 500 }
    );
  }
}
