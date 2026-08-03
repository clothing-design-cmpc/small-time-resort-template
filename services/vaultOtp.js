/**
 * FILE: services/vaultOtp.js
 * ROLE: Second-factor gate for the hidden recovery page — the piece
 *       services/vaultAuth.js's file header already promises exists.
 *
 * PURPOSE:
 * After the vault passphrase (services/vaultAuth.js) is accepted, the
 * vault is only half-unlocked. This file generates a 12-character
 * alphanumeric + special-character code (services/vaultOtpConfig.js),
 * stores a HASH of it (never the plaintext) in the otp* fields of the
 * consolidated singleton Vault row, and emails the plaintext to VAULT_OWNER_EMAIL via
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
 *    file, is what app/system-vault/[vaultSlug]/page.jsx and
 *    app/api/admin/breach/route.js actually gate on
 */
import { scryptSync, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/services/prisma";
import { sendGeneralEmail } from "@/services/emailjs";
import { VAULT_IDENTITY } from "@/services/vaultAuth";
import { OTP_EXPIRY_MINUTES, OTP_CODE_LENGTH, OTP_CHARSET } from "@/services/vaultOtpConfig";

const SCRYPT_KEY_LENGTH = 64;
const OTP_ROW_ID = "vault";

// Re-exported so existing callers/imports of OTP_EXPIRY_MINUTES from
// this file keep working — the real value now lives in
// services/vaultOtpConfig.js so the client countdown can read it too.
export { OTP_EXPIRY_MINUTES };

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
 * Creates a new 12-character code, overwrites the otp* fields on the
 * consolidated Vault row with its hash + a fresh expiry + attempts reset
 * to 0 (passphraseHash on the same row is left untouched), and emails the
 * plaintext code to VAULT_OWNER_EMAIL. Returns { success, message,
 * skipped, expiresAt } — best-effort on the email send, since a
 * misconfigured EmailJS env shouldn't crash the route, but the caller
 * DOES need to know if the email failed (unlike services/emailjs.js's
 * other callers, the owner has no other way to get this code).
 *
 * @param {boolean} forceNew - When false (the OTP screen's automatic
 *   on-mount send), an existing code that is still unexpired and under
 *   the attempt ceiling is left untouched instead of being replaced —
 *   this is what fixes the "code looked right but server said
 *   incorrect/expired" bug: every page refresh, tab revisit, or dev
 *   Fast Refresh remount used to fire another send, silently
 *   overwriting whatever code was already sitting in the owner's inbox
 *   before they could paste it back in. When true (the explicit
 *   "Resend code" button), a brand-new code is always generated and
 *   emailed, invalidating the previous one on purpose.
 */
export async function generateAndSendVaultOtp(forceNew = true) {
  const ownerEmail = process.env.VAULT_OWNER_EMAIL;
  if (!ownerEmail) {
    console.error("[vaultOtp] VAULT_OWNER_EMAIL is not set — cannot send OTP.");
    return { success: false, message: "Vault OTP is not configured. Contact the site owner." };
  }

  // Automatic (non-forced) send: if a code is already outstanding,
  // still valid, and hasn't been hammered past the attempt ceiling,
  // leave it alone. Re-sending here would just invalidate the one
  // already in the owner's inbox for no benefit.
  if (!forceNew) {
    const existingRow = await prisma.vault.findUnique({ where: { id: OTP_ROW_ID } });
    const isStillUsable =
      existingRow?.otpCodeHash &&
      existingRow.otpAttempts < OTP_MAX_ATTEMPTS &&
      existingRow.otpExpiresAt &&
      new Date() < existingRow.otpExpiresAt;

    if (isStillUsable) {
      return {
        success: true,
        skipped: true,
        message: `A code was already sent to ${maskEmail(ownerEmail)}. Check your inbox.`,
        expiresAt: existingRow.otpExpiresAt,
      };
    }
  }

  // randomInt is cryptographically secure — never Math.random() for
  // anything that gates access. Each character is picked independently
  // from OTP_CHARSET (letters + digits + symbols), giving far more
  // entropy per character than a numeric-only digit.
  const plaintextCode = Array.from(
    { length: OTP_CODE_LENGTH },
    () => OTP_CHARSET[randomInt(0, OTP_CHARSET.length)]
  ).join("");
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Upsert the singleton Vault row — a new send always replaces whatever
  // code (used or not) came before it, and resets attempts to 0. Only
  // the otp* fields are listed here, so passphraseHash on this same row
  // (if already set) is left completely untouched by this call.
  await prisma.vault.upsert({
    where: { id: OTP_ROW_ID },
    create: { id: OTP_ROW_ID, otpCodeHash: hashOtpCode(plaintextCode), otpExpiresAt: expiresAt, otpAttempts: 0 },
    update: { otpCodeHash: hashOtpCode(plaintextCode), otpExpiresAt: expiresAt, otpAttempts: 0 },
  });

  // Plain text only — no inline HTML. The EmailJS dashboard template
  // renders this field escaped ({{highlight_line_1}}, double braces),
  // so anything with HTML tags in it (the old <span style="..."> wrapper)
  // shows up as literal, broken-looking markup in the email instead of
  // being styled. Sending plain text here always reads cleanly
  // regardless of how the dashboard template treats the merge tag.
  const emailSent = await sendGeneralEmail({
    toEmail: ownerEmail,
    subject: "Your vault verification code",
    eyebrow: "VERIFICATION CODE",
    heading: "Your vault OTP code",
    intro: `Enter this code on the vault login screen to continue. It expires in ${OTP_EXPIRY_MINUTES} minute.`,
    highlightLine1: plaintextCode,
    highlightLine2: `Expires in ${OTP_EXPIRY_MINUTES} minute`,
    bodyMessage: "If you did not request this, someone else has your vault passphrase — change it immediately.",
    emailType: "vault_otp",
  });

  if (!emailSent) {
    return { success: false, message: "Failed to send the verification email. Please try again." };
  }

  return { success: true, message: `Code sent to ${maskEmail(ownerEmail)}.`, expiresAt };
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
  const otpRow = await prisma.vault.findUnique({ where: { id: OTP_ROW_ID } });

  if (!otpRow?.otpCodeHash) {
    return { verified: false, reason: "No OTP has been issued." };
  }

  if (otpRow.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return { verified: false, reason: "Max attempts exceeded for this code." };
  }

  if (!otpRow.otpExpiresAt || new Date() > otpRow.otpExpiresAt) {
    return { verified: false, reason: "Code expired." };
  }

  // Trim defensively even though the client now does this too — this
  // function is the actual security boundary, so it can't depend on
  // the client having sent a clean value.
  const submittedHash = Buffer.from(hashOtpCode((submittedCode ?? "").trim()), "hex");
  const storedHash = Buffer.from(otpRow.otpCodeHash, "hex");

  const isMatch =
    submittedHash.length === storedHash.length && timingSafeEqual(submittedHash, storedHash);

  if (!isMatch) {
    // Record the failed attempt so brute-forcing this code has a hard
    // ceiling even within the expiry window.
    await prisma.vault.update({
      where: { id: OTP_ROW_ID },
      data: { otpAttempts: { increment: 1 } },
    });
    return { verified: false, reason: "Incorrect code." };
  }

  // One-time use: NULL out only the otp* fields on success (never delete
  // the row) — this row also carries passphraseHash, which must survive.
  // The same code can never be replayed once these are cleared.
  await prisma.vault.update({
    where: { id: OTP_ROW_ID },
    data: { otpCodeHash: null, otpExpiresAt: null, otpAttempts: 0 },
  });

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
