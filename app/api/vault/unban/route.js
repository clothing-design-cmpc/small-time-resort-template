/**
 * FILE: app/api/vault/unban/route.js
 * ROLE: Owner only — requires active vault session PLUS a fresh TOTP code
 *
 * PURPOSE:
 * Executes the actual unban. This is the highest-sensitivity action in
 * the vault — a successful unban reopens a door into the admin panel.
 * A valid vault session alone is not enough: this route requires a
 * SECOND TOTP check entered at the moment of the click, so a hijacked
 * or left-open vault tab still can't unban anything on its own.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { verifyTotpCode } from "@/services/totp";
import { unbanDevice } from "@/services/deviceBan";
import { logSecurityEvent } from "@/services/securityLog";

export async function POST(request) {
  const sessionToken = request.cookies.get("vault_session")?.value;
  const { bannedDeviceId, totpCode } = await request.json();

  const session = sessionToken
    ? await prisma.vaultSession.findFirst({ where: { sessionToken, expiresAt: { gt: new Date() } } })
    : null;

  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault session expired." },
      { status: 401 }
    );
  }

  if (!bannedDeviceId || !totpCode) {
    return NextResponse.json(
      { success: false, data: null, message: "Missing verification code." },
      { status: 400 }
    );
  }

  const vault = await prisma.ownerVault.findFirst();
  const totpMatches = vault ? verifyTotpCode(totpCode, vault.totpSecret) : false;

  // Step-up check failed — do NOT unban. This is exactly the scenario
  // that protects against a hijacked-but-still-open vault dashboard tab.
  if (!totpMatches) {
    await logSecurityEvent({
      eventType: "admin_login_denied",
      request,
      details: "Vault unban denied — step-up code invalid",
    });
    return NextResponse.json({ success: false, data: null, message: "Invalid code." }, { status: 401 });
  }

  const updated = await unbanDevice(bannedDeviceId, "owner");

  await logSecurityEvent({
    eventType: "login_success",
    actor: "owner",
    request,
    details: `Device unbanned: ${updated.deviceFingerprint ?? updated.ipAddress ?? "unknown"}`,
  });

  return NextResponse.json({ success: true, data: updated, message: "Device unbanned successfully." });
}
