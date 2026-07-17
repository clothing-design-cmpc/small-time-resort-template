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
 *        the recovery page's "Step 3 — Unban an IP" list. Strictly
 *        read-only — unbanning happens only through
 *        app/api/admin/blocked-ips/unban/route.js, and only after that
 *        route's own step-up code check passes.
 *
 * DATA FLOW:
 * 1. RecoveryClient fetches this on mount, alongside the existing
 *    breach status fetch
 * 2. Each row is rendered with an "Unban" button that opens
 *    UnbanIpModal for that specific ipAddress
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireVaultSession } from "@/services/vaultAuth";

export async function GET(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
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
