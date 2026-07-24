/**
 * FILE: app/api/admin/system-health/route.js
 * ROLE: Vault-session only (requireVaultSession()) — same gate as
 *       app/api/admin/env-check. No super_admin "session" cookie is
 *       checked or required. Excluded from proxy.js's blanket
 *       /api/admin gate via VAULT_STANDALONE_API_PATHS, same as
 *       env-check, breach, blocked-ips, vault-wipe, and
 *       vault-activity-log.
 *
 * PURPOSE:
 * "System Health Check" card for the vault dashboard — read-only,
 * on-demand (never on mount). Confirms the database is reachable,
 * that the core tables the app depends on are queryable, and scans
 * for double-booking conflicts (two active bookings on the same room
 * with overlapping dates). See services/systemHealthCheck.js for the
 * full check logic — this route is a thin auth + response wrapper
 * around it, same pattern as env-check's relationship to
 * services/envCheck.js.
 *
 * DATA FLOW:
 * 1. Owner clicks "Run System Health Check" on the recovery dashboard
 * 2. GET here -> requireVaultSession() -> runSystemHealthCheck()
 * 3. A 401 means the vault session expired mid-visit — same handling
 *    as every other GET in RecoveryClient.jsx: back to this slug's
 *    own /login screen
 * 4. Result renders as three cards: connectivity, core tables, and
 *    any double-booking conflicts found
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireVaultSession } from "@/services/vaultAuth";
import { runSystemHealthCheck } from "@/services/systemHealthCheck";

export async function GET(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  try {
    const result = await runSystemHealthCheck();
    return NextResponse.json({
      success: true,
      data: result,
      message: "System health check completed.",
    });
  } catch (error) {
    console.error("[api/admin/system-health] Failed to run check:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't run the system health check. Please try again." },
      { status: 500 }
    );
  }
}
