/**
 * FILE: services/vaultOtpConfig.js
 * ROLE: Shared constants for the vault OTP flow — imported by BOTH
 *       services/vaultOtp.js (server-only: crypto, prisma, email) and
 *       app/system-vault/[vaultSlug]/otp/VaultOtpClient.jsx (client:
 *       countdown timer + form validation).
 *
 * PURPOSE:
 * services/vaultOtp.js can't be imported directly from a "use client"
 * file — it pulls in prisma and node:crypto, which would bloat (and
 * partially break) the client bundle. This file holds only the plain
 * values both sides need to agree on, so the client's countdown timer
 * always matches the server's real expiry, and the client's code
 * format validation always matches what the server actually generates.
 *
 * Changing OTP_EXPIRY_MINUTES or OTP_CODE_LENGTH here updates both the
 * server generator and the client countdown/validation at once — never
 * hardcode either value again in vaultOtp.js or VaultOtpClient.jsx.
 */

// Deliberately short — this gates disaster recovery, the owner is
// expected to be checking their inbox right after entering the
// passphrase, not reading it minutes later.
export const OTP_EXPIRY_MINUTES = 1;

// 12 characters, mixing letters, digits, and symbols — resists guessing
// far better than a 6-digit numeric code, at the cost of being copy-
// pasted rather than typed from memory (acceptable trade-off for a
// disaster-recovery code that's only ever read from an email).
export const OTP_CODE_LENGTH = 12;

// Ambiguous look-alike characters (0/O, 1/l/I) are excluded so the code
// is never misread when copied from an email on a small screen.
export const OTP_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";

// Exact-shape validator shared by the client Zod schema — matches
// precisely what generateAndSendVaultOtp() below can ever produce, so
// the client never accepts (or types) something the server would
// instantly reject anyway.
export const OTP_CODE_PATTERN = /^[A-HJ-NP-Za-km-z2-9!@#$%^&*]{12}$/;
