/**
 * FILE: services/vaultAuth.js
 * ROLE: Second-factor gate for the hidden recovery page only
 *
 * PURPOSE:
 * The hidden recovery page is a fully standalone login system — it no longer trusts, checks, or requires the regular
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
 * starts out in VAULT_PASSPHRASE_HASH (.env.local / host env) only, but
 * once services/breachResponse.js auto-rotates it for the first time,
 * Vault.passphraseHash (DB — consolidated on the same singleton row as
 * the OTP fields, see the Vault model) becomes the live value instead —
 * a running server can't rewrite its own .env.local at runtime, so the
 * DB is the only place a rotation can actually take effect without a
 * restart. See verifyVaultPassphrase()'s priority order below.
 *
 * Hashing uses Node's built-in crypto.scrypt — no extra dependency
 * (bcrypt/argon2) needed for a single shared secret. Format stored in
 * both VAULT_PASSPHRASE_HASH and Vault.passphraseHash is
 * "salt:hash", both hex-encoded.
 *
 * URL, NOT A FIXED PATH:
 * The hidden recovery page no longer lives at a hardcoded slug like
 * /system-vault/x9f2. Its folder is a dynamic Next.js route segment,
 * app/system-vault/[vaultSlug]/, and the ONLY slug value that ever
 * resolves to anything is computeVaultUrlSlug()'s output below — the
 * first 7 hex characters of sha256(current passphrase hash). Anyone
 * requesting any other slug gets a plain 404 from notFound(), same as
 * a page that was never built — never a redirect that would confirm
 * "this route pattern exists, you just have the wrong value". Because
 * the slug is derived from the passphrase hash, rotating the
 * passphrase (rotateVaultPassphrase() below) silently changes the URL
 * too — an attacker who somehow learned yesterday's URL loses it the
 * instant the passphrase rotates, without a separate URL-rotation step.
 *
 * DATA FLOW:
 * 1. Run `node scripts/hashVaultPassphrase.js` once (optionally seeded
 *    with generateVaultPassphrase() below) to turn a chosen passphrase
 *    into a "salt:hash" string, paste it into VAULT_PASSPHRASE_HASH in
 *    .env.local (never commit the plaintext)
 * 2. app/api/admin/vault-login/route.js calls verifyVaultPassphrase()
 *    — checks the DB value first, falls back to that env var — and on
 *    match sets an HttpOnly "vaultSession" cookie via
 *    buildVaultSessionCookieValue() — the uid stored inside it is the
 *    fixed literal "vault" (there is no super-admin identity behind it
 *    anymore; see VAULT_IDENTITY below)
 * 3. app/system-vault/[vaultSlug]/page.jsx (Server Component) and
 *    app/api/admin/breach/route.js both call requireVaultSession() —
 *    no vault session, no access to breach status or "End Lockdown",
 *    regardless of whether the caller has a regular super_admin
 *    session cookie at all
 * 4. services/breachResponse.js calls rotateVaultPassphrase() the
 *    instant Gatekeeper 1 or 2 trips — the passphrase used seconds ago
 *    stops working immediately, and the new one is emailed out via
 *    services/emailAlert.js's sendVaultPassphraseRotationEmail()
 */
import { scryptSync, randomBytes, randomInt, timingSafeEqual, createHash } from "node:crypto";
import { prisma } from "./prisma.js";

const SCRYPT_KEY_LENGTH = 64;

// Word list for generateVaultPassphrase() — plain, unambiguous, easy to
// read aloud or type from an email on a phone. Deliberately NOT a
// themed/curated list (no inside jokes, no project-specific words) so
// the generated passphrase never hints at anything else in this app.
const PASSPHRASE_WORD_LIST = [
  "amber", "anchor", "basil", "birch", "canyon", "cedar", "comet", "coral",
  "delta", "ember", "falcon", "fjord", "granite", "harbor", "indigo", "ivory",
  "jasper", "kestrel", "lagoon", "lantern", "maple", "marble", "meadow", "nectar",
  "onyx", "opal", "orchid", "pebble", "quartz", "raven", "ridge", "saffron",
  "sable", "shale", "signal", "sparrow", "summit", "tundra", "umber", "willow",
];

// Vault sessions are intentionally short — this is a disaster-recovery
// tool, not a page an admin should stay signed into all day. Matches
// the 30-minute idle-timeout standard used elsewhere in the admin area.
export const VAULT_SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 60;

// How long a vault passphrase stays valid before the scheduled
// auto-rotate route (app/api/system-vault-setup/auto-rotate) generates
// a fresh one automatically. Independent of manual generation — a
// manual click (the hidden system-vault-setup page — the only place
// generation happens) always resets this same 30-day window.
export const VAULT_PASSPHRASE_EXPIRY_DAYS = 30;

// The vault no longer inherits a super-admin's uid — there is no
// super-admin session behind it anymore. This fixed literal is used as
// the "uid" inside the vaultSession cookie and as the SecurityLog
// actor for every vault-related event, so log rows are still clearly
// attributable to "the vault", not to any specific admin account.
export const VAULT_IDENTITY = "vault";

// The prefix every valid recovery-page URL shares — used only for
// building/documenting the full URL below. The part that actually
// matters for security is the slug appended after it, which is never
// hardcoded anywhere (see computeVaultUrlSlug()).
const VAULT_RECOVERY_PATH_PREFIX = "/system-vault/";

/**
 * getEffectivePassphraseHash
 * Shared DB+env lookup used by both verifyVaultPassphrase() and
 * computeVaultUrlSlug() — the URL slug and the passphrase check must
 * always agree on which hash is "current", so this is the one place
 * that decides it. Same priority order as before: DB value (once a
 * rotation has happened) wins over the original .env.local value.
 * Returns "" if neither is configured yet — callers must handle that.
 */
async function getEffectivePassphraseHash() {
  let dbHash = null;
  try {
    const vaultPassphraseRow = await prisma.vaultPassphrase.findUnique({
      where: { id: "vault_passphrase" },
      select: { passphraseHash: true },
    });
    dbHash = vaultPassphraseRow?.passphraseHash ?? null;
  } catch (error) {
    // DB read failure must never crash vault login or URL generation —
    // fall back to env, same as verifyVaultPassphrase always has.
    console.error("[vaultAuth] Failed to read passphraseHash from DB:", error.message);
  }

  return dbHash || process.env.VAULT_PASSPHRASE_HASH || "";
}

/**
 * computeVaultUrlSlug
 * Derives the recovery page's URL slug from the CURRENT passphrase
 * hash: sha256(effectiveHash), first 7 hex characters. Deliberately
 * hashes the hash again rather than slicing the stored "salt:hash"
 * value directly — the stored value is itself a credential, and a
 * public URL segment is the last place a fragment of it should ever
 * appear, even indirectly. Returns null if no passphrase hash is
 * configured yet at all (fresh install, before the one-time
 * hashVaultPassphrase.js setup step) — callers must treat null as
 * "the vault isn't configured, nothing should resolve".
 */
export async function computeVaultUrlSlug() {
  const effectiveHash = await getEffectivePassphraseHash();
  if (!effectiveHash) return null;

  return createHash("sha256").update(effectiveHash).digest("hex").slice(0, 7);
}

/**
 * getVaultRecoveryPath
 * Just the path (no domain) — /system-vault/<current 7-char slug>.
 * Returns null if the vault has no passphrase hash configured yet
 * (see computeVaultUrlSlug()), same as that function.
 */
export async function getVaultRecoveryPath() {
  const slug = await computeVaultUrlSlug();
  return slug ? `${VAULT_RECOVERY_PATH_PREFIX}${slug}` : null;
}

/**
 * getVaultRecoveryUrl
 * Builds the full, clickable URL to the recovery page from
 * NEXT_PUBLIC_SITE_URL (the resort's live domain) + the CURRENT
 * hash-derived path. Falls back to a placeholder domain if the env var
 * isn't set yet, and to a "not configured yet" placeholder path if no
 * passphrase hash exists at all — so a missing config value never
 * crashes an email send or a Drive upload, it just prints an obviously
 * unfinished URL instead. Now async (the slug needs a DB read) —
 * every caller must await it.
 */
export async function getVaultRecoveryUrl() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain-here.com").replace(/\/$/, "");
  const path = (await getVaultRecoveryPath()) || `${VAULT_RECOVERY_PATH_PREFIX}not-configured-yet`;
  return `${siteUrl}${path}`;
}

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
 * generateVaultPassphrase
 * Produces a fresh, human-typable passphrase: 5 random words from
 * PASSPHRASE_WORD_LIST joined with hyphens, plus a random 7-digit
 * number — e.g. "harbor-quartz-ember-tundra-opal-maple-ridge-comet-
 * jasper-onyx-willow-sable-4827193". Uses crypto.randomInt
 * (cryptographically secure) for every pick, never Math.random, since
 * this passphrase gates disaster recovery.
 *
 * Used two ways:
 *  1. Manually, by an admin who wants a strong starting passphrase
 *     instead of inventing their own (scripts/hashVaultPassphrase.js
 *     can hash whatever this returns).
 *  2. Automatically by rotateVaultPassphrase() below, right after a
 *     Gatekeeper 1/2 breach trip.
 */
export function generateVaultPassphrase() {
  const words = Array.from(
    { length: 12 },
    () => PASSPHRASE_WORD_LIST[randomInt(0, PASSPHRASE_WORD_LIST.length)]
  );
  const trailingNumber = randomInt(1000000, 10000000); // 7-digit number, 1000000-9999999
  return `${words.join("-")}-${trailingNumber}`;
}

/**
 * verifyVaultPassphrase
 * Compares a submitted passphrase against the current vault passphrase
 * hash using a constant-time comparison (timingSafeEqual) so response
 * timing can't leak how many characters matched. Always derives a
 * scrypt hash even when no hash is configured (comparing against a
 * dummy salt) so a misconfigured value doesn't respond measurably
 * faster than a wrong passphrase would.
 *
 * Hash source priority:
 *  1. Vault.passphraseHash (DB) — set once rotation has
 *     happened at least once (see rotateVaultPassphrase below). This is
 *     the only value a running server can update at runtime.
 *  2. VAULT_PASSPHRASE_HASH (.env.local) — the original manually-set
 *     value, used until the first rotation ever writes to the DB.
 * Now async because of the DB read — every caller must await it.
 */
export async function verifyVaultPassphrase(submittedPassphrase) {
  const storedValue = await getEffectivePassphraseHash();
  const [storedSalt, storedHashHex] = storedValue.includes(":")
    ? storedValue.split(":")
    : ["0".repeat(32), "0".repeat(SCRYPT_KEY_LENGTH * 2)];

  const submittedHash = scryptSync(submittedPassphrase, storedSalt, SCRYPT_KEY_LENGTH);
  const storedHash = Buffer.from(storedHashHex, "hex");

  // timingSafeEqual throws if buffer lengths differ — guard that instead
  // of letting a malformed hash crash the login route.
  if (submittedHash.length !== storedHash.length) return false;

  const isMatch = timingSafeEqual(submittedHash, storedHash);

  // Never treat a missing/malformed hash as a valid passphrase, even in
  // the astronomically unlikely case the dummy comparison above matched.
  return isMatch && storedValue.includes(":");
}

/**
 * rotateVaultPassphrase
 * Generates a brand-new passphrase, hashes it, and saves the hash (plus
 * a fresh 30-day expiresAt) to VaultPassphrase.passphraseHash —
 * overwriting whatever the vault passphrase used to be, DB value or
 * original .env.local value alike. Returns the PLAINTEXT passphrase so
 * the caller (services/breachResponse.js, the manual settings-page
 * route, or the 30-day auto-rotate route below) can email it
 * immediately — this is the only place that plaintext ever exists
 * outside the admin's inbox. It is never logged, never written
 * anywhere else, and never returned in any API response body except
 * the one-time reveal on generate.
 *
 * Called automatically by triggerGatekeeperBreach() for Gatekeeper 1
 * (login brute force) and Gatekeeper 2 (SQL injection attempt), by the
 * manual "Generate New Passphrase" button (super-admin >
 * vault-passphrase and the hidden system-vault-setup page), and by
 * autoRotateVaultPassphraseIfExpired() below once VaultPassphrase.expiresAt
 * has passed — never for Gatekeeper 3, since that one fires after a
 * correct password was already entered and may just be the real
 * super-admin on a new device or new location, not an actual intrusion.
 */
export async function rotateVaultPassphrase() {
  const newPassphrase = generateVaultPassphrase();
  const newHash = hashVaultPassphrase(newPassphrase);
  const newExpiresAt = new Date(Date.now() + VAULT_PASSPHRASE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await prisma.vaultPassphrase.upsert({
    where: { id: "vault_passphrase" },
    update: { passphraseHash: newHash, expiresAt: newExpiresAt },
    create: { id: "vault_passphrase", passphraseHash: newHash, expiresAt: newExpiresAt },
  });

  return newPassphrase;
}

/**
 * isVaultPassphraseExpired
 * Reads VaultPassphrase.expiresAt and reports whether the current
 * passphrase is due for its 30-day auto-rotation. No row yet, no
 * expiresAt yet, or expiresAt in the past all count as "expired" —
 * each of those means the next scheduled run should generate a fresh
 * one. Read failures are treated as expired too (fail toward rotating,
 * never toward silently running on a stale/unreadable value forever).
 */
export async function isVaultPassphraseExpired() {
  try {
    const row = await prisma.vaultPassphrase.findUnique({
      where: { id: "vault_passphrase" },
      select: { expiresAt: true },
    });
    if (!row?.expiresAt) return true;
    return row.expiresAt.getTime() <= Date.now();
  } catch (error) {
    console.error("[vaultAuth] Failed to read VaultPassphrase.expiresAt:", error.message);
    return true;
  }
}

/**
 * autoRotateVaultPassphraseIfExpired
 * Called by the scheduled cron route
 * (app/api/system-vault-setup/auto-rotate/route.js) only — never by a
 * regular page load or login attempt, so the passphrase never changes
 * out from under someone mid-session. Checks expiresAt first and only
 * rotates when the 30 days are actually up; returns null on a no-op
 * run so the route can report "not due yet" instead of pretending a
 * rotation happened.
 */
export async function autoRotateVaultPassphraseIfExpired() {
  const expired = await isVaultPassphraseExpired();
  if (!expired) return null;

  return rotateVaultPassphrase();
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
 * Used by app/system-vault/[vaultSlug]/page.jsx to redirect straight to the
 * vault login screen before RecoveryClient ever renders, instead of
 * flashing recovery content and only then getting a 401 from the API.
 */
export function requireVaultSessionFromCookieStore(cookieStore) {
  return decodeVaultSessionCookieValue(cookieStore.get("vaultSession")?.value);
}
