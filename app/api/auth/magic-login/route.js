/**
 * FILE: app/api/auth/magic-login/route.js
 * ROLE: Public endpoint — the link target inside sendOwnerMagicLoginEmail
 *
 * PURPOSE:
 * Consumes a one-time magic login token (services/magicLogin.js), issued
 * only after 5 failed password attempts from the currently-trusted
 * SystemSettings.ownerVerifiedIp (see app/api/auth/login/route.js). This
 * is a passwordless recovery via a verified secondary channel (the
 * owner's own email inbox) — it never bypasses password verification
 * itself; getting a token in the first place still required 5 genuinely
 * failed password attempts against a real account from a known IP.
 *
 * DATA FLOW:
 * 1. Owner clicks the link in their email: GET /api/auth/magic-login?token=...
 * 2. consumeMagicLoginToken() hashes the token, looks it up, checks it
 *    isn't already used or expired, and marks it used in the same call
 * 3. On success, looks up the AdminProfile the token was issued for and
 *    sets the same HttpOnly "session" cookie the normal login route sets
 * 4. Redirects to /superAdmin/dashboard on success, or back to the login
 *    page with an error banner on an invalid/expired/already-used token
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { consumeMagicLoginToken } from "@/services/magicLogin";
import { logSecurityEvent } from "@/services/securityLog";

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const isProduction = process.env.NODE_ENV === "production";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawToken = searchParams.get("token");

  const loginPageUrl = new URL("/superAdmin/login", request.url);

  const adminId = await consumeMagicLoginToken(rawToken);

  if (!adminId) {
    loginPageUrl.searchParams.set("reason", "magic-link-invalid");
    return NextResponse.redirect(loginPageUrl);
  }

  let adminProfile;
  try {
    adminProfile = await prisma.adminProfile.findUnique({ where: { id: adminId } });
  } catch (error) {
    console.error("[magic-login] admin_profiles lookup failed:", error.message);
    loginPageUrl.searchParams.set("reason", "magic-link-invalid");
    return NextResponse.redirect(loginPageUrl);
  }

  if (!adminProfile || adminProfile.role !== "super_admin") {
    loginPageUrl.searchParams.set("reason", "magic-link-invalid");
    return NextResponse.redirect(loginPageUrl);
  }

  // Same log shape as a normal login_success row, so this shows up in
  // Security Logs identically — just with a details string that makes
  // clear it came through the magic-link path, not a typed password.
  await logSecurityEvent({
    eventType: "login_success",
    actor: adminProfile.fullName,
    request,
    details: `${adminProfile.fullName} signed in via one-time magic login link.`,
  });

  const sessionPayload = Buffer.from(
    JSON.stringify({ uid: adminId, role: adminProfile.role })
  ).toString("base64");

  const dashboardUrl = new URL("/superAdmin/dashboard", request.url);
  const response = NextResponse.redirect(dashboardUrl);

  response.cookies.set("session", sessionPayload, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
