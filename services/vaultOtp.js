/**
 * FILE: services/vaultOtp.js
 * ROLE: Second-factor gate for the hidden recovery page — the piece
 *       services/vaultAuth.js's file header already promises exists.
 *
 * PURPOSE:
 * After the vault passphrase (services/vaultAuth.js) is accepted, the
 * vault is only half-unlocked. This file generates a 6-digit code,
 * stores a HASH of it (never the plaintext) in the singleton VaultOtp
 * row, and emails the plaintext to VAULT_OWNER_EMAIL via
 * services/emailjs.js. The owner reads the code from their inbox and
 * types it into VaultOtpClient — the code itself never touches
 * localStorage, sessionStorage, or any client-readable storage, and
 * the comparison against the stored hash always happens here, on the
 * server, never in the browser.
 *
 * Deliberately DB-backed rather than in-memory (services/rateLimit.js's
 * in-memory Map is fine for simple counters, but an OTP must survive
 * between the "send" request and the "verify" request even if those
 * land on different serverless function instances — an in-memory Map
 * can't guarantee that).
 *
 * DATA FLOW:
 * 1. app/api/admin/vault-otp/route.js POST calls generateAndSendVaultOtp()
 *    once a valid (passphrase-only) vaultSession cookie exists
 * 2. That route's PATCH calls verifyVaultOtp() with the submitted code
 * 3. On match, the route calls services/vaultAuth.js's
 *    buildVaultSessionCookieValue(VAULT_IDENTITY, true) to re-issue the
 *    vaultSession cookie with otpVerified: true — that flag, not this
 *    file, is what app/system-vault-x9f2/page.jsx and
 *    app/api/admin/breach/route.js actually gate on
 */
import { scryptSync, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/services/prisma";
import { sendGeneralEmail } from "@/services/emailjs";
import { VAULT_IDENTITY } from "@/services/vaultAuth";

const SCRYPT_KEY_LENGTH = 64;
const OTP_ROW_ID = "vault";

// 6 digits — long enough to resist guessing within OTP_MAX_ATTEMPTS,
// short enough to type from an email without copy/paste errors.
const OTP_DIGIT_COUNT = 6;

// Deliberately short — this gates disaster recovery, the owner is
// expected to be checking their inbox right after entering the
// passphrase, not reading it hours later.
export const OTP_EXPIRY_MINUTES = 10;

// Attempts allowed against ONE issued code before it's rejected
// outright, regardless of time left on the clock. Mirrors Rule 32.1's
// priority-endpoint spirit without reusing checkRateLimit's per-IP
// window, since this needs to survive across the code's whole
// lifetime, not just a rolling window.
export const OTP_MAX_ATTEMPTS = 5;

/**
 * hashOtpCode
 * Same scrypt approach services/vaultAuth.js already uses for the
 * passphrase — no extra dependency needed for a single short-lived
 * secret. Salted with the fixed row id since a fresh salt would need
 * its own column; the code itself is random, short-lived, and single-
 * use, so a fixed salt here doesn't meaningfully weaken it.
 */
function hashOtpCode(plaintextCode) {
  return scryptSync(plaintextCode, `vault-otp:${OTP_ROW_ID}`, SCRYPT_KEY_LENGTH).toString("hex");
}

/**
 * generateAndSendVaultOtp
 * Creates a new 6-digit code, overwrites the singleton VaultOtp row
 * with its hash + a fresh expiry + attempts reset to 0, and emails the
 * plaintext code to VAULT_OWNER_EMAIL. Returns { success, message } —
 * best-effort on the email send, since a misconfigured EmailJS env
 * shouldn't crash the route, but the caller DOES need to know if the
 * email failed (unlike services/emailjs.js's other callers, the owner
 * has no other way to get this code).
 */
export async function generateAndSendVaultOtp() {
  const ownerEmail = process.env.VAULT_OWNER_EMAIL;
  if (!ownerEmail) {
    console.error("[vaultOtp] VAULT_OWNER_EMAIL is not set — cannot send OTP.");
    return { success: false, message: "Vault OTP is not configured. Contact the site owner." };
  }

  // randomInt is cryptographically secure — never Math.random() for
  // anything that gates access.
  const plaintextCode = String(randomInt(0, 10 ** OTP_DIGIT_COUNT)).padStart(OTP_DIGIT_COUNT, "0");
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Upsert the singleton row — a new send always replaces whatever
  // code (used or not) came before it, and resets attempts to 0.
  await prisma.vaultOtp.upsert({
    where: { id: OTP_ROW_ID },
    create: { id: OTP_ROW_ID, codeHash: hashOtpCode(plaintextCode), expiresAt, attempts: 0 },
    update: { codeHash: hashOtpCode(plaintextCode), expiresAt, attempts: 0 },
  });

  const emailSent = await sendGeneralEmail({
    toEmail: ownerEmail,
    subject: "Your vault verification code",
    eyebrow: "VERIFICATION CODE",
    heading: "Your vault OTP code",
    intro: `Enter this code on the vault login screen to continue. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    highlightLine1: plaintextCode,
    highlightLine2: `Expires in ${OTP_EXPIRY_MINUTES} minutes`,
    bodyMessage: "If you did not request this, someone else has your vault passphrase — change it immediately.",
  });

  if (!emailSent) {
    return { success: false, message: "Failed to send the verification email. Please try again." };
  }

  return { success: true, message: `Code sent to ${maskEmail(ownerEmail)}.` };
}

/**
 * verifyVaultOtp
 * Compares a submitted code against the stored hash using a constant-
 * time comparison, same pattern as verifyVaultPassphrase(). Enforces
 * both the expiry and the attempt ceiling, and increments attempts on
 * every wrong guess (including expired/missing-row cases counted as a
 * generic failure) so a caller can't retry a dead code forever.
 *
 * Returns { verified: boolean, reason?: string } — reason is for
 * SecurityLog detail text, never shown verbatim to the client (the
 * route always returns the same generic "Incorrect or expired code."
 * message, mirroring vault-login's "never reveal which part failed").
 */
export async function verifyVaultOtp(submittedCode) {
  const otpRow = await prisma.vaultOtp.findUnique({ where: { id: OTP_ROW_ID } });

  if (!otpRow) {
    return { verified: false, reason: "No OTP has been issued." };
  }

  if (otpRow.attempts >= OTP_MAX_ATTEMPTS) {
    return { verified: false, reason: "Max attempts exceeded for this code." };
  }

  if (new Date() > otpRow.expiresAt) {
    return { verified: false, reason: "Code expired." };
  }

  const submittedHash = Buffer.from(hashOtpCode(submittedCode ?? ""), "hex");
  const storedHash = Buffer.from(otpRow.codeHash, "hex");

  const isMatch =
    submittedHash.length === storedHash.length && timingSafeEqual(submittedHash, storedHash);

  if (!isMatch) {
    // Record the failed attempt so brute-forcing this code has a hard
    // ceiling even within the expiry window.
    await prisma.vaultOtp.update({
      where: { id: OTP_ROW_ID },
      data: { attempts: { increment: 1 } },
    });
    return { verified: false, reason: "Incorrect code." };
  }

  // One-time use: delete the row on success so the same code can never
  // be replayed, even before it would have naturally expired.
  await prisma.vaultOtp.delete({ where: { id: OTP_ROW_ID } });

  return { verified: true };
}

/**
 * maskEmail
 * Shows just enough of the destination address to confirm to the
 * person at the keyboard that the email went somewhere plausible,
 * without fully echoing VAULT_OWNER_EMAIL back in an API response.
 */
function maskEmail(email) {
  const [localPart, domain] = email.split("@");
  if (!domain) return "your inbox";
  const visible = localPart.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(localPart.length - 2, 1))}@${domain}`;
}

// Re-exported so callers only need to import from this file when
// building the "who is this OTP for" SecurityLog actor field.
export { VAULT_IDENTITY };
