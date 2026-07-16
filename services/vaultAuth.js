/**
 * FILE: services/vaultAuth.js
 * ROLE: Second-factor gate for the hidden recovery page only
 *
 * PURPOSE:
 * The hidden recovery page (/system-vault-x9f2) used to trust the same
 * "session" cookie every other /superAdmin/* route trusts. That meant
 * anyone who already had a valid super-admin session — including a
 * stolen one — could open the disaster-recovery page with nothing
 * extra. This file adds a SEPARATE vault passphrase that must be
 * entered on its own login screen before the recovery page's contents
 * (breach status, "End Lockdown") become reachable, even for an
 * already-logged-in super-admin.
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
 *    cookie via buildVaultSessionCookieValue()
 * 3. app/system-vault-x9f2/page.jsx (Server Component) and
 *    app/api/admin/breach/route.js both call requireVaultSession() —
 *    no vault session, no access to breach status or "End Lockdown",
 *    regardless of the regular super_admin session cookie's validity
 */
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;

// Vault sessions are intentionally short — this is a disaster-recovery
// tool, not a page an admin should stay signed into all day. Matches
// the 30-minute idle-timeout standard used elsewhere in the admin area.
export const VAULT_SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 60;

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
 * the pattern stays consistent across the codebase.
 */
export function buildVaultSessionCookieValue(uid) {
  return Buffer.from(JSON.stringify({ uid, grantedAt: Date.now() })).toString("base64");
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

    return decoded;
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
