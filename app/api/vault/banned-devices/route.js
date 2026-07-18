/**
 * FILE: app/api/vault/banned-devices/route.js
 * ROLE: Owner only — requires an active, non-expired vault session
 *
 * PURPOSE:
 * Returns the list of currently banned devices/IPs for the vault
 * dashboard's Unban section. Strictly read-only — never unbans anything.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { listActiveBans } from "@/services/deviceBan";

export async function GET(request) {
  try {
    const sessionToken = request.cookies.get("vault_session")?.value;

    // Reject before touching any ban data if the vault session is missing or expired
    const session = sessionToken
      ? await prisma.vaultSession.findFirst({ where: { sessionToken, expiresAt: { gt: new Date() } } })
      : null;

    if (!session) {
      return NextResponse.json(
        { success: false, data: null, message: "Vault session expired." },
        { status: 401 }
      );
    }

    const bans = await listActiveBans();
    return NextResponse.json({ success: true, data: bans, message: "Banned devices fetched." });
  } catch (error) {
    console.error("[vault/banned-devices] Unexpected error:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the banned devices list. Please try again." },
      { status: 500 }
    );
  }
}
