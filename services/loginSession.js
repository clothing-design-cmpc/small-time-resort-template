/**
 * FILE: services/loginSession.js
 * PURPOSE:
 * Extracted from app/api/auth/login/route.js so the exact same
 * "finish a successful super-admin login" steps (session cookie +
 * AdminSession row) can run from two places: the normal login route
 * (clean, non-anomalous logins) and app/api/auth/login-otp/verify/route.js
 * (anomalous logins that passed the Gatekeeper 3 OTP challenge — see
 * services/loginAnomalyOtp.js). Neither route builds the cookie/session
 * shape independently anymore, so the two paths can never quietly
 * drift apart.
 *
 * DATA FLOW:
 * 1. buildSessionPayload() creates a fresh session id + the base64
 *    cookie payload proxy.js decodes on every /superAdmin/* request.
 * 2. attachSessionCookie() sets that payload as the HttpOnly cookie on
 *    the NextResponse the caller is about to return.
 * 3. persistAdminSession() writes the AdminSession row so this device
 *    counts toward SystemSettings.maxAdminSessions, same as before.
 */
import crypto from "node:crypto";
import { createAdminSession } from "@/services/adminAccessLimit";

// Same 7-day lifetime the login route always used — moved here so both
// call sites agree on one value instead of two separate constants that
// could accidentally drift.
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * buildSessionPayload
 * Returns a fresh sessionId (this device/browser's own AdminSession row
 * id — logout uses it to delete exactly this session) and the base64
 * cookie payload encoding { uid, role, sid }.
 */
export function buildSessionPayload({ authUserId, role }) {
  const sessionId = crypto.randomUUID();
  const sessionPayload = Buffer.from(
    JSON.stringify({ uid: authUserId, role, sid: sessionId })
  ).toString("base64");
  return { sessionId, sessionPayload };
}

/**
 * attachSessionCookie
 * Sets the HttpOnly/SameSite=strict "session" cookie on the given
 * NextResponse. Secure is only enforced in production since Secure
 * cookies are silently dropped over plain HTTP (local dev).
 */
export function attachSessionCookie(response, sessionPayload, isProduction) {
  response.cookies.set("session", sessionPayload, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

/**
 * persistAdminSession
 * Writes the AdminSession row — expiresAt mirrors the cookie's own
 * maxAge so a session that's never explicitly logged out (browser
 * crash, killed process) still stops counting toward the access limit
 * once the cookie itself would have expired.
 */
export async function persistAdminSession({ sessionId, authUserId, ipAddress }) {
  await createAdminSession({
    id: sessionId,
    adminId: authUserId,
    ipAddress: ipAddress && ipAddress !== "unknown" ? ipAddress : null,
    expiresAt: new Date(Date.now() + SESSION_COOKIE_MAX_AGE_SECONDS * 1000),
  });
}
