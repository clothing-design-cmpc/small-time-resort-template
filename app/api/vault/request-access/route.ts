/**
 * FILE: app/api/vault/request-access/route.ts
 * ROLE: Super-admin only, non-owner — protected by requireSuperAdmin() below
 *
 * PURPOSE:
 * A super_admin whose AdminProfile.isOwner is false cannot access the
 * vault directly (see services/vaultAuth.js). This route logs their
 * request and emails the actual vault owner (VAULT_OWNER_EMAIL) so the
 * owner can approve ending the lockdown themselves. Never grants access
 * directly — this only notifies; approval always happens through the
 * owner's own vault session.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { logSecurityEvent } from "@/services/securityLog";
import { sendGeneralEmail } from "@/services/emailjs";
import { requireSuperAdmin } from "@/services/adminSession";
import { adminClient } from "@/services/supabase";

export async function POST(request: Request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  const { vaultCode } = await request.json();
  // AdminProfile has no email column — email lives only in Supabase Auth,
  // same reason app/api/auth/login/route.js resolves it via adminClient
  // rather than a Prisma column.
  const { data: userLookup } = await adminClient.auth.admin.getUserById(session.uid);
  const requestedBy = userLookup?.user?.email ?? "unknown";
  const requestedAt = new Date().toISOString();

  // Record the request so it shows up in Security Logs for audit purposes
  await logSecurityEvent({
    eventType: "admin_login_denied",
    actor: requestedBy,
    request,
    details: `Requested vault-owner approval to end lockdown (vault: ${vaultCode})`,
  });

  // sendGeneralEmail is a single-template sender (services/emailjs.js) —
  // there's no separate "vault_access_request" template, so the vault
  // context is composed into its generic heading/intro/highlight fields.
  const wasSent = await sendGeneralEmail({
    toEmail: process.env.VAULT_OWNER_EMAIL ?? "",
    subject: "Vault access request — approval needed",
    heading: "Vault Access Requested",
    eyebrow: "Security",
    intro: `${requestedBy} is requesting approval to end vault lockdown ${vaultCode}.`,
    highlightLine1: `Requested by: ${requestedBy}`,
    highlightLine2: `Requested at: ${requestedAt}`,
    bodyMessage: "Sign in to the Super-Admin dashboard to review and approve this request.",
  });

  if (!wasSent) {
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