/**
 * FILE: app/api/admin/vault-activity-log/route.js
 * ROLE: Vault-session only (requireVaultSession) — excluded from
 *       proxy.js's blanket /api/admin super_admin gate via
 *       VAULT_STANDALONE_API_PATHS. Never checks requireSuperAdmin().
 *
 * PURPOSE:
 * Read-only feed for the Danger Zone's "Activity Log" card
 * (VaultActivityLogSection.jsx) — every SecurityLog row written by
 * the vault itself (schedule/cancel/truncate a wipe, end a lockdown,
 * lift a post-wipe lockdown, unlock/lock the vault, OTP steps,
 * passphrase rotation). This exists as its own vault-scoped route,
 * separate from /api/admin/security-logs, because that route is
 * gated by requireSuperAdmin() — a session this page must work
 * without, same reasoning as every other route under
 * VAULT_STANDALONE_API_PATHS.
 *
 * DATA FLOW:
 * 1. On mount and every 30s, VaultActivityLogSection.jsx GETs this route
 * 2. requireVaultSession() (OTP-verified) gates access — no super-admin
 *    session involved at any point
 * 3. Returns the most recent VAULT_ACTIVITY_LOG_LIMIT SecurityLog rows
 *    whose actor is the vault's own identity (services/vaultAuth.js's
 *    VAULT_IDENTITY, "vault") — this naturally excludes every
 *    unrelated admin_action row (booking cancellations, etc.) written
 *    by the regular /superAdmin session, since those always log a
 *    real admin's name as the actor instead
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireVaultSession, VAULT_IDENTITY } from "@/services/vaultAuth";

const VAULT_ACTIVITY_LOG_LIMIT = 20;

export async function GET(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  try {
    const logs = await prisma.securityLog.findMany({
      where: { actor: VAULT_IDENTITY },
      orderBy: { createdAt: "desc" },
      take: VAULT_ACTIVITY_LOG_LIMIT,
      select: {
        id: true,
        eventType: true,
        details: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: { logs },
      message: "Vault activity log fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/vault-activity-log GET] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to load the activity log. Please try again." },
      { status: 500 }
    );
  }
}
