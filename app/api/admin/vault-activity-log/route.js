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
 * 1. On mount, on every page change, and every 30s (page 1 only —
 *    see VaultActivityLogSection.jsx), GETs this route with ?page=
 * 2. requireVaultSession() (OTP-verified) gates access — no super-admin
 *    session involved at any point
 * 3. Returns one VAULT_ACTIVITY_LOG_PAGE_SIZE page of SecurityLog rows
 *    whose actor is the vault's own identity (services/vaultAuth.js's
 *    VAULT_IDENTITY, "vault") — this naturally excludes every
 *    unrelated admin_action row (booking cancellations, etc.) written
 *    by the regular /superAdmin session, since those always log a
 *    real admin's name as the actor instead — plus totalCount/
 *    totalPages so DataTable's pagination footer can render
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireVaultSession, VAULT_IDENTITY } from "@/services/vaultAuth";

const VAULT_ACTIVITY_LOG_PAGE_SIZE = 20;

export async function GET(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  // Page is 1-indexed on the wire, same convention DataTable/other
  // super-admin list pages already use — clamp to at least 1 so a
  // malformed/missing query param never turns into a negative skip.
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  try {
    const where = { actor: VAULT_IDENTITY };

    const [logs, totalCount] = await Promise.all([
      prisma.securityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * VAULT_ACTIVITY_LOG_PAGE_SIZE,
        take: VAULT_ACTIVITY_LOG_PAGE_SIZE,
        select: {
          id: true,
          eventType: true,
          details: true,
          createdAt: true,
        },
      }),
      prisma.securityLog.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        logs,
        page,
        pageSize: VAULT_ACTIVITY_LOG_PAGE_SIZE,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / VAULT_ACTIVITY_LOG_PAGE_SIZE)),
      },
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
