/**
 * FILE: app/api/vault/login/route.js
 * ROLE: Owner only — first checkpoint of the secret vault system
 *
 * PURPOSE:
 * Verifies the vault passphrase + TOTP code together. On success, issues
 * a short-lived vault session token in an HttpOnly cookie. This session
 * only grants dashboard VIEW access — the unban action itself requires
 * a second, separate TOTP check (see /api/vault/unban).
 *
 * DATA FLOW:
 * 1. Owner submits passphrase + TOTP code from the vault login page
 * 2. Both are checked together — a dummy bcrypt compare always runs
 *    even if the vault record is missing, so response timing can't be
 *    used to detect whether a vault exists at all (Rule 32.4 pattern)
 * 3. On success, a random session token is stored server-side and set
 *    as an HttpOnly cookie
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/services/prisma";
import { verifyTotpCode } from "@/services/totp";
import { logSecurityEvent } from "@/services/securityLog";

const VAULT_SESSION_MINUTES = 20; // Vault sessions are intentionally short-lived
const DUMMY_HASH = "$2b$12$dummyhashfordummypurposeonlyXXXXXXXXXXXXXXXXXXXXXX";

export async function POST(request) {
  let passphrase, totpCode;
  try {
    ({ passphrase, totpCode } = await request.json());
  } catch {
    // Malformed body (not valid JSON) — this is a client input error, not
    // a server failure, so it stays a 400 rather than falling into the
    // generic 500 below.
    return NextResponse.json(
      { success: false, data: null, message: "Invalid request format." },
      { status: 400 }
    );
  }

  try {
    if (!passphrase || !totpCode) {
      return NextResponse.json(
        { success: false, data: null, message: "Passphrase and code are required." },
        { status: 400 }
      );
    }

    const vault = await prisma.ownerVault.findFirst();

    // Always run the bcrypt compare, even with a dummy hash, so a missing
    // vault record doesn't respond measurably faster than a wrong passphrase.
    const passphraseMatches = await bcrypt.compare(passphrase, vault?.passphraseHash ?? DUMMY_HASH);
    const totpMatches = vault ? verifyTotpCode(totpCode, vault.totpSecret) : false;

    if (!vault || !passphraseMatches || !totpMatches) {
      await logSecurityEvent({
        eventType: "admin_login_denied",
        request,
        details: "Vault access denied — invalid passphrase or code",
      });
      return NextResponse.json(
        { success: false, data: null, message: "Invalid passphrase or code." },
        { status: 401 }
      );
    }

    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + VAULT_SESSION_MINUTES * 60 * 1000);

    await prisma.vaultSession.create({ data: { sessionToken, expiresAt } });

    await logSecurityEvent({ eventType: "login_success", request, details: "Vault access granted" });

    const response = NextResponse.json({ success: true, data: null, message: "Vault unlocked." });
    response.cookies.set("vault_session", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: VAULT_SESSION_MINUTES * 60,
    });
    return response;
  } catch (error) {
    // Never expose raw error detail to the client (Rule 18.2).
    console.error("[vault/login] Unexpected error:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't process that. Please try again." },
      { status: 500 }
    );
  }
}
