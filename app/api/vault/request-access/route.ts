/**
 * FILE: app/api/vault/request-access/route.ts
 * ROLE: Called by an authenticated vault session that lacks super-admin role
 *
 * PURPOSE:
 * Logs the access request as a security event and emails the super-admin
 * so they can approve ending the lockdown themselves. Never grants access
 * directly — this only notifies; approval always happens through the
 * super-admin's own authenticated session.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { logSecurityEvent } from "@/services/securityLog";
import { sendEmail } from "@/services/emailjs";
import { getSessionFromRequest } from "@/services/auth";

export async function POST(request: Request) {
  const { vaultCode } = await request.json();
  const session = await getSessionFromRequest(request);

  // Record the request so it shows up in Security Logs for audit purposes
  await logSecurityEvent({
    eventType: "admin_login_denied",
    actor: session?.email ?? "unknown",
    request,
    details: `Requested super-admin approval to end lockdown (vault: ${vaultCode})`,
  });

  const result = await sendEmail("vault_access_request", {
    requested_by: session?.email ?? "unknown",
    vault_code: vaultCode,
    requested_at: new Date().toISOString(),
  });

  if (!result.success) {
    return NextResponse.json(
      { success: false, data: null, message: "Failed to notify super-admin. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: null,
    message: "Super-admin notified.",
  });
}