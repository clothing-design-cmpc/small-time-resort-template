/**
 * FILE: app/api/admin/blocked-ips/request-view-code/route.js
 * ROLE: Vault-session only (requireVaultSession, otpVerified) —
 *       excluded from proxy.js's blanket /api/admin super_admin gate
 *       via VAULT_STANDALONE_API_PATHS ("/api/admin/blocked-ips"
 *       prefix already covers this nested path).
 *
 * PURPOSE:
 * Step-up re-verification for VIEWING the Step 3 blocked-IP list —
 * deliberately separate from request-unban-code/route.js's code.
 * A vault session alone can reach this dashboard, but the list of
 * who's currently blocked (their IPs, reasons, which gatekeeper
 * tripped) stays hidden until a fresh code is entered; unbanning any
 * one of them afterward requires its own second, separate fresh code
 * via request-unban-code/route.js. Two distinct checkpoints, two
 * distinct emails, each only when its own step is actually reached.
 *
 * Same forceNew body contract as request-unban-code/route.js — the
 * step-up modal's automatic on-mount call sends forceNew: false so
 * React StrictMode's dev-only double-effect-fire can't send two
 * separate codes/emails for one modal open.
 *
 * DATA FLOW:
 * 1. Clicking "View Blocked IPs" (RecoveryClient.jsx) calls this route
 * 2. The owner enters the code, checked by GET /api/admin/blocked-ips
 *    (?code=...) — never by this route
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireVaultSession } from "@/services/vaultAuth";
import { generateAndSendVaultOtp } from "@/services/vaultOtp";

export async function POST(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  let forceNew = true;
  try {
    const body = await request.json();
    if (typeof body?.forceNew === "boolean") forceNew = body.forceNew;
  } catch {
    // No body sent — keep the default.
  }

  const result = await generateAndSendVaultOtp(forceNew);

  if (!result.success) {
    return NextResponse.json({ success: false, data: null, message: result.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: { expiresAt: result.expiresAt },
    message: result.message,
  });
}
