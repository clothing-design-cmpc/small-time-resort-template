/**
 * FILE: app/api/admin/env-check/route.js
 * ROLE: Vault-session only (requireVaultSession()) — same gate as
 *       app/api/admin/breach's full-detail branch. No super_admin
 *       "session" cookie is checked or required. Excluded from
 *       proxy.js's blanket /api/admin gate the same way breach/
 *       sql-import/blocked-ips already are (see VAULT_STANDALONE_API_PATHS
 *       in proxy.js — add this path there too).
 *
 * PURPOSE:
 * Task 3 — "Environment Check" feature for the vault dashboard. Reports
 * whether every .env key the app depends on is actually set, plus four
 * live checks (database connectivity, GeoIP file presence, Google
 * Drive OAuth token validity, and an actual EmailJS test send). Never
 * returns a secret's value — presence/absence only. The EmailJS check
 * sends one real email (uses part of the account's monthly quota) —
 * acceptable because this whole endpoint only ever runs when the owner
 * clicks "Run Environment Check," never automatically. See
 * services/envCheck.js for the full spec and reasoning.
 *
 * DATA FLOW:
 * 1. Owner clicks "Run Environment Check" on the recovery dashboard
 * 2. GET here -> requireVaultSession() -> checkEnvironment()
 * 3. Response renders as a per-group pass/fail list, with all four live
 *    checks (DB, GeoIP, Drive, EmailJS) called out separately
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireVaultSession } from "@/services/vaultAuth";
import { checkEnvironment } from "@/services/envCheck";

export async function GET(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  try {
    const result = await checkEnvironment();
    return NextResponse.json({
      success: true,
      data: result,
      message: "Environment check completed.",
    });
  } catch (error) {
    console.error("[api/admin/env-check] Failed to run check:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't run the environment check. Please try again." },
      { status: 500 }
    );
  }
}
