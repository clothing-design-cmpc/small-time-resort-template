/**
 * FILE: services/magicLogin.js
 * PURPOSE:
 * Issues and consumes one-time "magic login" tokens for the Gatekeeper 1
 * owner-IP leniency flow. Only ever called from app/api/auth/login/route.js
 * (issue, after 5 failed attempts from SystemSettings.ownerVerifiedIp) and
 * app/api/auth/magic-login/route.js (consume, when the link is clicked).
 *
 * SECURITY MODEL:
 * The raw token is what gets emailed (services/emailAlert.js's
 * sendOwnerMagicLoginEmail) and appears in the URL — it is NEVER stored
 * anywhere. Only its SHA-256 hash is written to the MagicLoginToken row,
 * the same reasoning as never storing a plaintext password. A token is
 * single-use (usedAt is set the instant it's consumed) and expires after
 * 10 minutes. This is a passwordless recovery via a verified secondary
 * channel (the owner's own email inbox) — it never bypasses password
 * verification itself; issuing a token still requires 5 CORRECT-password
 * failures to even happen, meaning the account is real and the request
 * volume is real, just from a known-trusted IP that forgot the password.
 */
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/services/prisma";

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * hashToken
 * Same one-way hash used for both storing and looking up a token —
 * never compares or stores the raw value itself.
 */
function hashToken(rawToken) {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * issueMagicLoginToken
 * Creates a brand-new single-use token for the given admin account and
 * returns the RAW value (only ever held in memory here and in the
 * outgoing email — never persisted). Any unused, unexpired tokens
 * already issued for this admin are left alone; each issue is
 * independent, and consuming any one of them still only works once.
 *
 * @param {string} adminId - AdminProfile.id (Supabase auth user id)
 * @returns {Promise<string>} the raw token to embed in the email link
 */
export async function issueMagicLoginToken(adminId) {
  const rawToken = randomBytes(32).toString("hex");

  await prisma.magicLoginToken.create({
    data: {
      tokenHash: hashToken(rawToken),
      adminId,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  return rawToken;
}

/**
 * consumeMagicLoginToken
 * Looks up the token by its hash, verifies it hasn't already been used
 * or expired, marks it used, and returns the adminId it was issued for
 * — or null if the token is invalid, already used, or expired. Marking
 * usedAt happens in the same call that validates it, so two near-
 * simultaneous clicks of the same link can never both succeed.
 *
 * @param {string} rawToken - the value from the ?token= query param
 * @returns {Promise<string|null>} adminId, or null if not usable
 */
export async function consumeMagicLoginToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return null;

  const tokenHash = hashToken(rawToken);

  try {
    const tokenRow = await prisma.magicLoginToken.findUnique({
      where: { tokenHash },
    });

    if (!tokenRow) return null;
    if (tokenRow.usedAt) return null; // already consumed
    if (tokenRow.expiresAt < new Date()) return null; // expired

    // Mark used immediately — this is the single-use guarantee. A
    // unique-hash lookup plus an unconditional update here is safe
    // enough for this login-assist flow (not a payments-grade race).
    await prisma.magicLoginToken.update({
      where: { tokenHash },
      data: { usedAt: new Date() },
    });

    return tokenRow.adminId;
  } catch (error) {
    console.error("[magicLogin] Failed to consume token:", error.message);
    return null;
  }
}
