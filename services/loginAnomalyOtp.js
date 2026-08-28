/**
 * FILE: services/loginAnomalyOtp.js
 * PURPOSE:
 * Gatekeeper 3 pre-lockdown step. When app/api/auth/login/route.js
 * sees a correct password from an anomalous device/location (new
 * device or impossible travel — services/securityLog.js's
 * detectAnomalies()), it calls createLoginAnomalyChallenge() here
 * instead of immediately firing the full breach response. This emails
 * a 6-digit code to the resort owner and holds the login in a
 * "pending" state — see prisma/schema.prisma's LoginAnomalyChallenge
 * model header comment for the full two-outcome flow.
 *
 * Same scrypt hashing + timing-safe comparison pattern
 * services/vaultOtp.js already uses, adapted to a per-attempt DB row
 * instead of a singleton — every login attempt gets its own row and
 * its own code, since (unlike the vault) many different login
 * attempts can be pending at once.
 *
 * DATA FLOW:
 * 1. app/api/auth/login/route.js calls createLoginAnomalyChallenge()
 *    the moment an anomalous-but-correct-password login is detected.
 *    Returns { challengeId, expiresAt } — never the plaintext code.
 * 2. The login page (app/superAdmin/login/page.jsx) shows a "check
 *    your email" form with a code input and a countdown built from
 *    expiresAt.
 * 3. On submit, app/api/auth/login-otp/verify/route.js calls
 *    verifyLoginAnomalyChallenge(). A match finishes the login
 *    normally (services/loginSession.js); a wrong code, max attempts,
 *    or an already-expired row all return shouldTriggerBreach: true so
 *    that route can fire Gatekeeper 3 exactly as before this feature
 *    existed.
 * 4. If the 3-minute countdown runs out with nothing submitted, the
 *    page calls app/api/auth/login-otp/expire/route.js, which calls
 *    expireLoginAnomalyChallenge() here — same shouldTriggerBreach
 *    signal, so silence is treated as a possible attacker, never as
 *    implicit approval.
 */
import { scryptSync, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/services/prisma";
import { sendLoginAnomalyOtpEmail } from "@/services/emailAlert";
import { sendLoginAnomalyOtpTelegramAlert } from "@/services/vaultTelegramAlerts";

const SCRYPT_KEY_LENGTH = 64;

// 3-minute window, per the resort owner's explicit choice — longer
// than the vault OTP's 1 minute since this one requires switching to
// an email app on a possibly different device, not just reading an
// already-open inbox tab.
export const OTP_EXPIRY_MINUTES = 3;

// Attempts allowed against ONE issued code before it's rejected
// outright and treated as a failed challenge — same reasoning as
// services/vaultOtp.js's OTP_MAX_ATTEMPTS, sized slightly higher here
// since a 6-digit numeric code has less entropy per character than the
// vault's 12-character alphanumeric+symbol code and typos are more
// likely on a phone.
export const OTP_MAX_ATTEMPTS = 5;

const OTP_DIGITS = "0123456789";
const OTP_CODE_LENGTH = 6;

/**
 * hashOtpCode
 * Salted with the challenge's own id (unlike the vault's fixed-row
 * salt) since many rows exist at once here — reusing one fixed salt
 * across every pending challenge would let two challenges with the
 * same code produce the same hash, which the vault's singleton-row
 * design never had to worry about.
 */
function hashOtpCode(plaintextCode, challengeId) {
  return scryptSync(plaintextCode, `login-anomaly-otp:${challengeId}`, SCRYPT_KEY_LENGTH).toString("hex");
}

/**
 * createLoginAnomalyChallenge
 * Creates the pending row, emails the plaintext code to the owner, and
 * returns the public-safe fields the login route needs to respond
 * with. Never returns the plaintext code or the hash.
 *
 * @param {object} input
 * @param {string} input.email
 * @param {string} input.authUserId
 * @param {string} input.role
 * @param {string} input.fullName
 * @param {string|null} input.ipAddress
 * @param {string|null} input.deviceFingerprint
 * @param {string|null} input.anomalyReason
 * @param {boolean} input.skipIpBlock - carried over from the login
 *   route's existing owner-IP leniency check, applied only if this
 *   challenge ultimately fails/expires and Gatekeeper 3 actually fires.
 * @param {boolean} [input.rememberDevice] - the login page's "Remember
 *   this device" checkbox value, carried on the row so verify/route.js
 *   knows — only once THIS code is confirmed — whether to also mint a
 *   TrustedDevice (services/trustedDevice.js) so future logins from
 *   this browser can skip the OTP step entirely.
 */
export async function createLoginAnomalyChallenge({
  email,
  authUserId,
  role,
  fullName,
  ipAddress,
  deviceFingerprint,
  anomalyReason,
  skipIpBlock,
  rememberDevice,
}) {
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Create first (with a placeholder hash) so we have the row's own id
  // to use as the hash salt, then immediately update it with the real
  // hash — two fast local writes, no window where a guessable hash sits
  // in the DB.
  const challenge = await prisma.loginAnomalyChallenge.create({
    data: {
      email,
      authUserId,
      role,
      fullName,
      otpCodeHash: "pending",
      ipAddress,
      deviceFingerprint,
      anomalyReason,
      skipIpBlock: Boolean(skipIpBlock),
      rememberDevice: Boolean(rememberDevice),
      expiresAt,
    },
  });

  // Cryptographically secure — never Math.random() for anything that
  // gates access.
  const plaintextCode = Array.from(
    { length: OTP_CODE_LENGTH },
    () => OTP_DIGITS[randomInt(0, OTP_DIGITS.length)]
  ).join("");

  await prisma.loginAnomalyChallenge.update({
    where: { id: challenge.id },
    data: { otpCodeHash: hashOtpCode(plaintextCode, challenge.id) },
  });

  const emailSent = await sendLoginAnomalyOtpEmail({
    code: plaintextCode,
    attemptedEmail: email,
    anomalyReason,
    ipAddress,
    expiryMinutes: OTP_EXPIRY_MINUTES,
  });

  if (!emailSent) {
    // Best-effort — the challenge row still exists and the login stays
    // pending, but the owner has no way to complete it if the email
    // never arrived. Surfaced to the caller so the login route can
    // decide how to respond (still shows "check your email" — a resend
    // isn't in scope for this first version).
    console.error("[loginAnomalyOtp] Failed to send OTP email for", email);
  }

  // Second, independent channel — sent regardless of whether the email
  // above succeeded, same reasoning as every other vault-security code
  // in this app (services/vaultTelegramAlerts.js). A missed/delayed
  // email must never be the only way to complete this challenge before
  // its short window runs out.
  const telegramSent = await sendLoginAnomalyOtpTelegramAlert({
    code: plaintextCode,
    attemptedEmail: email,
    anomalyReason,
    expiryMinutes: OTP_EXPIRY_MINUTES,
  });

  if (!telegramSent) {
    console.error("[loginAnomalyOtp] Failed to send OTP Telegram alert for", email);
  }

  return { challengeId: challenge.id, expiresAt, emailSent, telegramSent };
}

/**
 * verifyLoginAnomalyChallenge
 * Compares a submitted code against the stored hash using a constant-
 * time comparison, mirroring services/vaultOtp.js's verifyVaultOtp().
 * Returns either the resolved challenge row (verified: true, for the
 * caller to finish the login) or shouldTriggerBreach: true (wrong code,
 * max attempts exceeded, already expired, or no such row).
 */
export async function verifyLoginAnomalyChallenge(challengeId, submittedCode) {
  const challenge = await prisma.loginAnomalyChallenge.findUnique({ where: { id: challengeId } });

  if (!challenge || challenge.status !== "pending") {
    // Already resolved (approved/failed/expired) or never existed —
    // never trigger a second breach response for an already-resolved
    // row, but never treat this as a success either.
    return { verified: false, shouldTriggerBreach: false, reason: "No pending challenge." };
  }

  if (new Date() > challenge.expiresAt) {
    await prisma.loginAnomalyChallenge.update({
      where: { id: challengeId },
      data: { status: "expired", respondedAt: new Date() },
    });
    return { verified: false, shouldTriggerBreach: true, challenge, reason: "Code expired." };
  }

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.loginAnomalyChallenge.update({
      where: { id: challengeId },
      data: { status: "failed", respondedAt: new Date() },
    });
    return { verified: false, shouldTriggerBreach: true, challenge, reason: "Max attempts exceeded." };
  }

  const submittedHash = Buffer.from(hashOtpCode((submittedCode ?? "").trim(), challengeId), "hex");
  const storedHash = Buffer.from(challenge.otpCodeHash, "hex");
  const isMatch = submittedHash.length === storedHash.length && timingSafeEqual(submittedHash, storedHash);

  if (!isMatch) {
    const nextAttempts = challenge.attempts + 1;
    const attemptsExceeded = nextAttempts >= OTP_MAX_ATTEMPTS;

    await prisma.loginAnomalyChallenge.update({
      where: { id: challengeId },
      data: {
        attempts: nextAttempts,
        // Fail immediately on this same request once the ceiling is
        // hit — no need to wait for a 6th submit that can't happen
        // from the UI anyway.
        ...(attemptsExceeded ? { status: "failed", respondedAt: new Date() } : {}),
      },
    });

    return {
      verified: false,
      shouldTriggerBreach: attemptsExceeded,
      challenge,
      reason: attemptsExceeded ? "Max attempts exceeded." : "Incorrect code.",
    };
  }

  await prisma.loginAnomalyChallenge.update({
    where: { id: challengeId },
    data: { status: "approved", respondedAt: new Date() },
  });

  return { verified: true, shouldTriggerBreach: false, challenge };
}

/**
 * expireLoginAnomalyChallenge
 * Called when the login page's own 3-minute countdown reaches zero
 * with nothing submitted. Double-checks server-side that the window
 * has genuinely passed (never trusts the client's clock alone) before
 * marking the row expired and signaling the caller to fire Gatekeeper 3.
 * A no-op (shouldTriggerBreach: false) if the row was already resolved
 * by a real verify call that landed first.
 */
export async function expireLoginAnomalyChallenge(challengeId) {
  const challenge = await prisma.loginAnomalyChallenge.findUnique({ where: { id: challengeId } });

  if (!challenge || challenge.status !== "pending") {
    return { shouldTriggerBreach: false };
  }

  if (new Date() <= challenge.expiresAt) {
    // Client fired early (clock skew, etc.) — leave the row pending,
    // never expire it ahead of its own stored deadline.
    return { shouldTriggerBreach: false };
  }

  await prisma.loginAnomalyChallenge.update({
    where: { id: challengeId },
    data: { status: "expired", respondedAt: new Date() },
  });

  return { shouldTriggerBreach: true, challenge };
}
