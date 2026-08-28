/**
 * FILE: services/trustedDevice.js
 * PURPOSE:
 * Gatekeeper 3's OTP challenge is now mandatory on every super-admin
 * login — no more automatic exemption for known devices/IPs, and no
 * exception for the resort owner (see app/api/auth/login/route.js's
 * header for the before/after). The ONLY way to skip it is this
 * feature: the owner checks "Remember this device" on the login page,
 * and once that login clears the OTP step, a random token is minted,
 * hashed, and stored on a TrustedDevice row scoped to that one admin
 * account. The raw token itself only ever lives in an HttpOnly
 * "trustedDevice" cookie on that browser — never in the DB, same
 * never-store-the-raw-secret pattern services/magicLogin.js already
 * uses for its own token.
 *
 * DATA FLOW:
 * 1. Login page posts { email, password, rememberDevice } — the
 *    checkbox value rides along on the very first request, but nothing
 *    is created yet at this point (see prisma/schema.prisma's
 *    LoginAnomalyChallenge.rememberDevice comment for why it has to
 *    wait until after OTP is actually confirmed).
 * 2. app/api/auth/login/route.js reads the "trustedDevice" cookie (if
 *    any) BEFORE deciding whether to challenge — verifyTrustedDevice()
 *    below is what lets a remembered device skip the OTP step entirely
 *    and finish the login exactly like the old "clean login" path did.
 * 3. If no valid trusted device is found, OTP fires unconditionally
 *    (mandatory now, not just for anomalous logins). Only once
 *    app/api/auth/login-otp/verify/route.js confirms the code AND the
 *    resolved challenge row has rememberDevice: true does this file's
 *    createTrustedDevice() ever get called.
 */
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "./prisma.js";

// 30 days — long enough that a returning admin isn't re-prompted every
// session, short enough that a stolen/forgotten browser doesn't stay
// trusted indefinitely. Independent of SESSION_COOKIE_MAX_AGE_SECONDS
// (7 days, services/loginSession.js) — the device stays "remembered"
// across many individual 7-day sessions until this longer window lapses.
export const TRUSTED_DEVICE_MAX_AGE_DAYS = 30;
const TRUSTED_DEVICE_COOKIE_MAX_AGE_SECONDS = TRUSTED_DEVICE_MAX_AGE_DAYS * 24 * 60 * 60;

export const TRUSTED_DEVICE_COOKIE_NAME = "trustedDevice";

/**
 * hashToken
 * Same one-way SHA-256 hash used for both storing and looking up a
 * token — the raw value is never written to the DB, only compared
 * against by re-hashing whatever the cookie presents.
 */
function hashToken(rawToken) {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * createTrustedDevice
 * Called only from app/api/auth/login-otp/verify/route.js, only when
 * the just-confirmed challenge had rememberDevice: true. Mints a fresh
 * random token, stores its hash + a 30-day expiry against this admin's
 * authUserId, and returns the RAW token so the caller can set it as
 * the "trustedDevice" cookie — this is the only place that raw value
 * ever exists outside the admin's own browser.
 *
 * @param {string} authUserId - AdminProfile.id (Supabase auth user id)
 * @param {string|null} deviceFingerprint - from the just-verified SecurityLog row, stored for reference only (never compared against on its own — the token is the actual credential)
 * @param {string|null} ipAddress
 * @returns {Promise<string>} the raw token to set as the cookie value
 */
export async function createTrustedDevice({ authUserId, deviceFingerprint, ipAddress }) {
  const rawToken = randomBytes(32).toString("hex");

  await prisma.trustedDevice.create({
    data: {
      authUserId,
      tokenHash: hashToken(rawToken),
      deviceFingerprint: deviceFingerprint || null,
      ipAddress: ipAddress && ipAddress !== "unknown" ? ipAddress : null,
      expiresAt: new Date(Date.now() + TRUSTED_DEVICE_COOKIE_MAX_AGE_SECONDS * 1000),
    },
  });

  return rawToken;
}

/**
 * verifyTrustedDevice
 * Checks whether the raw token from the "trustedDevice" cookie matches
 * an unexpired TrustedDevice row belonging to THIS SPECIFIC authUserId
 * — a valid token for one admin account can never skip OTP for a
 * different admin account, even from the same physical browser/cookie
 * jar. Best-effort updates lastUsedAt on a match; that write failing
 * never blocks the login itself.
 *
 * @param {string} authUserId - the admin account currently attempting to log in
 * @param {string|null|undefined} rawToken - the "trustedDevice" cookie's raw value, if present
 * @returns {Promise<boolean>} true only on a genuine, unexpired match for this exact account
 */
export async function verifyTrustedDevice({ authUserId, rawToken }) {
  if (!rawToken) return false;

  let deviceRow;
  try {
    deviceRow = await prisma.trustedDevice.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  } catch (error) {
    // A DB read failure must fail CLOSED here (never trust an unverifiable
    // token) — opposite of vaultAuth.js's fail-toward-rotating posture,
    // since the failure mode here is "extra OTP prompt", not "locked out".
    console.error("[trustedDevice] Failed to read TrustedDevice row:", error.message);
    return false;
  }

  if (!deviceRow || deviceRow.authUserId !== authUserId) return false;
  if (deviceRow.expiresAt.getTime() <= Date.now()) return false;

  prisma.trustedDevice
    .update({ where: { id: deviceRow.id }, data: { lastUsedAt: new Date() } })
    .catch((error) => console.error("[trustedDevice] Failed to update lastUsedAt:", error.message));

  return true;
}

/**
 * attachTrustedDeviceCookie
 * Sets the HttpOnly/Secure(prod)/SameSite=strict "trustedDevice" cookie
 * on the given NextResponse — same security posture as the "session"
 * cookie (services/loginSession.js), just a much longer lifetime since
 * its whole purpose is to survive across many separate login sessions.
 */
export function attachTrustedDeviceCookie(response, rawToken, isProduction) {
  response.cookies.set(TRUSTED_DEVICE_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: TRUSTED_DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
