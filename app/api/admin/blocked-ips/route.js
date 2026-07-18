/**
 * FILE: app/api/admin/blocked-ips/route.js
 * ROLE: Vault-session only (requireVaultSession, otpVerified) — excluded
 *       from proxy.js's blanket /api/admin super_admin gate via
 *       VAULT_STANDALONE_API_PATHS, same carve-out as
 *       app/api/admin/breach/route.js. No super_admin session cookie
 *       is checked or required on this path.
 *
 * PURPOSE:
 * GET -> returns every row currently in BlockedIp, newest first. Feeds
 *        the recovery page's "Step 3 — Unban an IP" list. Requires
 *        BOTH the vault session AND a fresh step-up code passed as
 *        ?code=... (requested via request-view-code/route.js) — the
 *        list itself (who's blocked, their reasons, which gatekeeper
 *        tripped) stays hidden behind its own checkpoint, separate
 *        from the one unbanning any individual row requires. Strictly
 *        read-only either way — unbanning happens only through
 *        app/api/admin/blocked-ips/unban/route.js, gated by its own,
 *        separate fresh code.
 *
 * DATA FLOW:
 * 1. RecoveryClient shows a "View Blocked IPs" button, not the list,
 *    until the owner completes the step-up modal
 * 2. On a valid code, this GET returns the list and the code is
 *    consumed (verifyVaultOtp deletes it on success) — a second call
 *    needs a brand-new code, same as every other vault step-up
 * 3. Each row is then rendered with an "Unban" button that opens
 *    UnbanIpModal, which requests its own separate fresh code
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireVaultSession } from "@/services/vaultAuth";
import { verifyVaultOtp } from "@/services/vaultOtp";

export async function GET(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  const code = new URL(request.url).searchParams.get("code");
  if (!code) {
    return NextResponse.json(
      { success: false, data: null, message: "A verification code is required to view blocked IPs." },
      { status: 400 }
    );
  }

  const { verified } = await verifyVaultOtp(code);
  if (!verified) {
    return NextResponse.json(
      { success: false, data: null, message: "Incorrect or expired code." },
      { status: 401 }
    );
  }

  try {
    const blockedIps = await prisma.blockedIp.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: { blockedIps },
      message: "Blocked IPs fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/blocked-ips] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load blocked IPs. Please try again." },
      { status: 500 }
    );
  }
}
