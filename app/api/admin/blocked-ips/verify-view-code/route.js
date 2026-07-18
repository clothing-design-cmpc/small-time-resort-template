/**
 * FILE: app/api/admin/blocked-ips/verify-view-code/route.js
 * ROLE: Vault-session only (requireVaultSession, otpVerified) — excluded
 *       from proxy.js's blanket /api/admin super_admin gate via
 *       VAULT_STANDALONE_API_PATHS.
 *
 * PURPOSE:
 * Gate #1 of Step 3, separate from the unban gate. A valid vault
 * session (passphrase + login OTP) is enough to reach the dashboard,
 * but the blocked-IP list itself — which would show a hacker their
 * own device's banned IP sitting right there — stays hidden until a
 * SECOND fresh emailed code is confirmed. This route only verifies
 * that code; it never deletes anything and never returns the IP list
 * itself (RecoveryClient calls GET /api/admin/blocked-ips separately,
 * only after this route returns success).
 *
 * Reuses the exact same request/verify pair as the unban step
 * (POST /api/admin/blocked-ips/request-unban-code to send the code,
 * verifyVaultOtp() to check it) rather than adding a second OTP
 * system — the code is one-time-use, so confirming it here to view
 * the list consumes it, and a brand-new code is required afterward
 * to actually unban any IP in that list. Two separate fresh codes for
 * two separate actions — a hijacked-but-open vault tab still can't
 * see or touch the list without a code landing in the real owner's
 * inbox each time.
 *
 * DATA FLOW:
 * 1. RecoveryClient's "View Blocked IPs" button opens
 *    ViewBlockedIpsModal, which POSTs request-unban-code on mount
 *    exactly like UnbanIpModal already does
 * 2. Owner enters the code -> PATCH here with { code }
 * 3. verifyVaultOtp(code) — same one-time, hashed, attempt-limited
 *    check every other vault step-up uses
 * 4. On match: nothing is deleted, a SecurityLog entry is written,
 *    and the client sets isBlockedIpsRevealed(true) then fetches the
 *    actual list via GET /api/admin/blocked-ips
 * 5. On mismatch: list stays hidden, a denied attempt is logged
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
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

  const { code } = await request.json();

  if (!code) {
    return NextResponse.json(
      { success: false, data: null, message: "Missing verification code." },
      { status: 400 }
    );
  }

  const { verified, reason } = await verifyVaultOtp(code);

  // Step-up check failed — the blocked-IP list stays hidden. This is
  // exactly the scenario that protects against a hijacked-but-still-
  // open vault dashboard tab: even with a live session, no list shows
  // without a fresh code from the real owner's inbox.
  if (!verified) {
    await logSecurityEvent({
      eventType: "admin_login_denied",
      actor: vaultSession.uid,
      request,
      details: `Blocked-IP list view denied — step-up code invalid (${reason ?? "unknown reason"}).`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Incorrect or expired code." },
      { status: 401 }
    );
  }

  await logSecurityEvent({
    eventType: "admin_action",
    actor: vaultSession.uid,
    request,
    details: "Revealed the blocked-IP list via vault recovery page.",
  });

  return NextResponse.json({ success: true, data: null, message: "Verified." });
}
