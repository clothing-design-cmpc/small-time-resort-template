/**
 * FILE: services/vaultAuth.js
 * ROLE: Second-factor gate for the hidden recovery page only
 *
 * PURPOSE:
 * The hidden recovery page (/system-vault-x9f2) is a fully standalone
 * login system — it no longer trusts, checks, or requires the regular
 * "session" cookie every /superAdmin/* route trusts. Whoever holds
 * that cookie (including a stolen one) gets nothing extra here; the
 * only way in is this file's own chain: a vault passphrase, then an
 * emailed OTP (services/vaultOtp.js). This file adds that separate
 * vault passphrase, entered on its own login screen, as the first of
 * those two factors.
 *
 * Deliberately NOT reusing Supabase Auth or admin_profiles: the whole
 * point of this page is to recover the site when something has already
 * gone wrong, so its own gate must not depend on the same auth stack
 * that a breach could plausibly be compromising. The passphrase hash
 * lives only in VAULT_PASSPHRASE_HASH (.env.local / host env), never in
 * the database.
 *
 * Hashing uses Node's built-in crypto.scrypt — no extra dependency
 * (bcrypt/argon2) needed for a single shared secret. Format stored in
 * VAULT_PASSPHRASE_HASH is "salt:hash", both hex-encoded.
 *
 * DATA FLOW:
 * 1. Run `node scripts/hashVaultPassphrase.js` once to turn a chosen
 *    passphrase into a "salt:hash" string, paste it into
 *    VAULT_PASSPHRASE_HASH in .env.local (never commit the plaintext)
 * 2. app/api/admin/vault-login/route.js calls verifyVaultPassphrase()
 *    against that env var and, on match, sets an HttpOnly "vaultSession"
 *    cookie via buildVaultSessionCookieValue() — the uid stored inside
 *    it is the fixed literal "vault" (there is no super-admin identity
 *    behind it anymore; see VAULT_IDENTITY below)
 * 3. app/system-vault-x9f2/page.jsx (Server Component) and
 *    app/api/admin/breach/route.js both call requireVaultSession() —
 *    no vault session, no access to breach status or "End Lockdown",
 *    regardless of whether the caller has a regular super_admin
 *    session cookie at all
 */
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;

// Vault sessions are intentionally short — this is a disaster-recovery
// tool, not a page an admin should stay signed into all day. Matches
// the 30-minute idle-timeout standard used elsewhere in the admin area.
export const VAULT_SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 60;

// The vault no longer inherits a super-admin's uid — there is no
// super-admin session behind it anymore. This fixed literal is used as
// the "uid" inside the vaultSession cookie and as the SecurityLog
// actor for every vault-related event, so log rows are still clearly
// attributable to "the vault", not to any specific admin account.
export const VAULT_IDENTITY = "vault";

/**
 * hashVaultPassphrase
 * Turns a plaintext passphrase into a "salt:hash" string for
 * VAULT_PASSPHRASE_HASH. Only ever run offline via
 * scripts/hashVaultPassphrase.js — never called from a request handler.
 */
export function hashVaultPassphrase(plaintextPassphrase) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plaintextPassphrase, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * verifyVaultPassphrase
 * Compares a submitted passphrase against VAULT_PASSPHRASE_HASH using a
 * constant-time comparison (timingSafeEqual) so response timing can't
 * leak how many characters matched. Always derives a scrypt hash even
 * when VAULT_PASSPHRASE_HASH is missing/malformed (comparing against a
 * dummy salt) so a misconfigured env var doesn't respond measurably
 * faster than a wrong passphrase would.
 */
export function verifyVaultPassphrase(submittedPassphrase) {
  const storedValue = process.env.VAULT_PASSPHRASE_HASH ?? "";
  const [storedSalt, storedHashHex] = storedValue.includes(":")
    ? storedValue.split(":")
    : ["0".repeat(32), "0".repeat(SCRYPT_KEY_LENGTH * 2)];

  const submittedHash = scryptSync(submittedPassphrase, storedSalt, SCRYPT_KEY_LENGTH);
  const storedHash = Buffer.from(storedHashHex, "hex");

  // timingSafeEqual throws if buffer lengths differ — guard that instead
  // of letting a malformed env var crash the login route.
  if (submittedHash.length !== storedHash.length) return false;

  const isMatch = timingSafeEqual(submittedHash, storedHash);

  // Never treat a missing/malformed VAULT_PASSPHRASE_HASH as a valid
  // passphrase, even in the astronomically unlikely case the dummy
  // comparison above matched.
  return isMatch && storedValue.includes(":");
}

/**
 * buildVaultSessionCookieValue
 * Base64-encodes the vault session payload, mirroring the shape
 * services/adminSession.js uses for the regular "session" cookie so
 * the pattern stays consistent across the codebase. Callers pass
 * VAULT_IDENTITY as uid — there is no super-admin account behind a
 * vault session, so this is always the same fixed literal, never a
 * real admin's ID.
 *
 * otpVerified defaults to false: the passphrase alone (this function's
 * first caller, app/api/admin/vault-login/route.js) only ever proves
 * the first factor. services/vaultOtp.js's caller
 * (app/api/admin/vault-otp/route.js) re-issues the cookie with
 * otpVerified: true once the emailed code checks out — grantedAt is
 * NOT reset on that re-issue, so the total vault session window stays
 * bounded to VAULT_SESSION_COOKIE_MAX_AGE_SECONDS from the original
 * passphrase login, not extended by however long OTP entry took.
 */
export function buildVaultSessionCookieValue(uid, otpVerified = false) {
  return Buffer.from(JSON.stringify({ uid, grantedAt: Date.now(), otpVerified })).toString("base64");
}

/**
 * reissueVaultSessionCookieValue
 * Re-encodes an already-decoded vault session payload with
 * otpVerified flipped to true, preserving the original grantedAt so
 * the OTP step can't extend the overall session lifetime. Used by
 * app/api/admin/vault-otp/route.js's PATCH handler after
 * verifyVaultOtp() succeeds — it already holds the decoded session
 * (via requireVaultSession) and just needs to upgrade it in place.
 */
export function reissueVaultSessionCookieValue(decodedVaultSession) {
  return Buffer.from(
    JSON.stringify({ ...decodedVaultSession, otpVerified: true })
  ).toString("base64");
}

/**
 * decodeVaultSessionCookieValue
 * Shared core for both variants below: decodes the raw "vaultSession"
 * cookie string and returns { uid, grantedAt } only if it's well-formed
 * and hasn't outlived VAULT_SESSION_COOKIE_MAX_AGE_SECONDS. Returns null
 * for anything missing, malformed, or expired.
 */
function decodeVaultSessionCookieValue(vaultCookieValue) {
  if (!vaultCookieValue) return null;

  try {
    const decoded = JSON.parse(Buffer.from(vaultCookieValue, "base64").toString("utf-8"));
    if (!decoded?.uid || typeof decoded?.grantedAt !== "number") return null;

    const ageSeconds = (Date.now() - decoded.grantedAt) / 1000;
    if (ageSeconds > VAULT_SESSION_COOKIE_MAX_AGE_SECONDS) return null;

    // Cookies issued before the OTP step existed won't have this key —
    // treat anything but a literal true as "not yet OTP-verified".
    return { ...decoded, otpVerified: decoded.otpVerified === true };
  } catch {
    return null;
  }
}

/**
 * requireVaultSession
 * Route Handler variant — reads the "vaultSession" cookie off the
 * incoming Request (request.cookies.get()). Used by
 * app/api/admin/breach/route.js so a valid super_admin session cookie
 * alone can never be enough to read full breach detail or end a
 * lockdown — this is checked IN ADDITION TO requireSuperAdmin(), never
 * as a replacement for it.
 */
export function requireVaultSession(request) {
  return decodeVaultSessionCookieValue(request.cookies.get("vaultSession")?.value);
}

/**
 * requireVaultSessionFromCookieStore
 * Server Component variant — reads the "vaultSession" cookie off the
 * read-only cookie store returned by next/headers' cookies(), which
 * exposes the same .get(name) -> { value } shape as request.cookies.
 * Used by app/system-vault-x9f2/page.jsx to redirect straight to the
 * vault login screen before RecoveryClient ever renders, instead of
 * flashing recovery content and only then getting a 401 from the API.
 */
export function requireVaultSessionFromCookieStore(cookieStore) {
  return decodeVaultSessionCookieValue(cookieStore.get("vaultSession")?.value);
}
