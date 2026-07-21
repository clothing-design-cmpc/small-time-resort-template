/**
 * FILE: services/gatekeeperVaultAuth.js
 * ROLE: Gate for the hidden Gatekeeper Tester page only — completely
 *       separate secret from services/vaultAuth.js's disaster-recovery
 *       vault. Holding a valid "vaultSession" (recovery vault) grants
 *       nothing here, and vice versa.
 *
 * PURPOSE:
 * The Gatekeeper Tester (dry-runs Gatekeeper 1/2 breach detectors
 * against this deployment) used to live at the fixed, nav-linked path
 * /superAdmin/gatekeeper-tester, reachable by any super-admin session.
 * It's moved here so it has its own separate secret: a passphrase-only
 * gate, a hash-derived URL slug that changes whenever the passphrase is
 * regenerated, and NO listing anywhere in the Sidebar/AdminHeader.
 *
 * WHY PASSPHRASE-ONLY (NO EMAIL OTP, UNLIKE services/vaultAuth.js):
 * The recovery vault (vaultAuth.js) exists to regain control of the
 * site after a suspected breach, so it deliberately needs two
 * independent factors. This page is a lower-stakes internal testing
 * tool — its dry run already requires knowing this exact hidden URL
 * AND this passphrase, and it only ever affects test data (see
 * services/gatekeeperTester.js's own cleanup guarantees). One factor is
 * proportionate here; add OTP later if the stakes ever change.
 *
 * URL, NOT A FIXED PATH (same technique as services/vaultAuth.js):
 * Lives at app/gatekeeper-vault/[gatekeeperSlug]/, a dynamic route
 * segment. The only slug value that ever resolves to anything is
 * computeGatekeeperVaultUrlSlug()'s output below — the first 7 hex
 * characters of sha256(current passphrase hash). Any other value gets
 * a plain 404 from notFound(), never a redirect that would confirm
 * "this route pattern exists". Rotating the passphrase silently
 * changes the URL too.
 *
 * DATA FLOW:
 * 1. Run `node scripts/hashGatekeeperVaultPassphrase.js` once (optionally
 *    seeded with generateGatekeeperVaultPassphrase() below), paste the
 *    printed value into GATEKEEPER_VAULT_PASSPHRASE_HASH in .env.local
 *    (never commit the plaintext)
 * 2. app/api/gatekeeper-vault/login/route.js calls
 *    verifyGatekeeperVaultPassphrase() — checks the DB value first,
 *    falls back to that env var — and on match sets an HttpOnly
 *    "gatekeeperVaultSession" cookie
 * 3. app/gatekeeper-vault/[gatekeeperSlug]/page.jsx (Server Component)
 *    and app/api/gatekeeper-vault/run/route.js both call
 *    requireGatekeeperVaultSession() — no session, no access to the
 *    tester UI or the dry-run endpoint, regardless of any regular
 *    super_admin session cookie
 */
import { scryptSync, randomBytes, randomInt, timingSafeEqual, createHash } from "node:crypto";
import { prisma } from "./prisma.js";

const SCRYPT_KEY_LENGTH = 64;

// Deliberately plain, unthemed words — same reasoning as
// vaultAuth.js's own list — so a generated passphrase never hints at
// anything else in this app.
const PASSPHRASE_WORD_LIST = [
  "amber", "anchor", "basil", "birch", "canyon", "cedar", "comet", "coral",
  "delta", "ember", "falcon", "fjord", "granite", "harbor", "indigo", "ivory",
  "jasper", "kestrel", "lagoon", "lantern", "maple", "marble", "meadow", "nectar",
  "onyx", "opal", "orchid", "pebble", "quartz", "raven", "ridge", "saffron",
  "sable", "shale", "signal", "sparrow", "summit", "tundra", "umber", "willow",
];

// Matches the 30-minute admin idle-timeout standard used elsewhere.
export const GATEKEEPER_VAULT_SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 60;

// How long a passphrase stays valid before the scheduled auto-rotate
// route regenerates one automatically. A manual "Generate New
// Passphrase" click always resets this same window too.
export const GATEKEEPER_VAULT_PASSPHRASE_EXPIRY_DAYS = 30;

// Fixed literal used as both the "uid" inside the session cookie and
// the SecurityLog actor for every event this gate produces — there is
// no super-admin identity behind this gate, just "whoever knows the
// passphrase for this hidden URL".
export const GATEKEEPER_VAULT_IDENTITY = "gatekeeper_vault";

const GATEKEEPER_VAULT_PATH_PREFIX = "/gatekeeper-vault/";

/**
 * getEffectivePassphraseHash
 * Shared DB+env lookup — the URL slug and the passphrase check must
 * always agree on which hash is "current". DB value (once a rotation
 * has happened) wins over the original .env.local value. Returns "" if
 * neither is configured yet — callers must handle that.
 */
async function getEffectivePassphraseHash() {
  let dbHash = null;
  try {
    const row = await prisma.gatekeeperVaultPassphrase.findUnique({
      where: { id: "gatekeeper_vault_passphrase" },
      select: { passphraseHash: true },
    });
    dbHash = row?.passphraseHash ?? null;
  } catch (error) {
    // DB read failure must never crash login or URL generation — fall
    // back to env, same as verifyGatekeeperVaultPassphrase always has.
    console.error("[gatekeeperVaultAuth] Failed to read passphraseHash from DB:", error.message);
  }

  return dbHash || process.env.GATEKEEPER_VAULT_PASSPHRASE_HASH || "";
}

/**
 * computeGatekeeperVaultUrlSlug
 * Derives the hidden page's URL slug from the CURRENT passphrase hash:
 * sha256(effectiveHash), first 7 hex characters. Hashes the hash again
 * rather than slicing the stored "salt:hash" value directly — a public
 * URL segment is the last place a fragment of a credential should ever
 * appear, even indirectly. Returns null if nothing is configured yet
 * (fresh install, before the one-time hash script is run) — callers
 * must treat null as "nothing should resolve".
 */
export async function computeGatekeeperVaultUrlSlug() {
  const effectiveHash = await getEffectivePassphraseHash();
  if (!effectiveHash) return null;

  return createHash("sha256").update(effectiveHash).digest("hex").slice(0, 7);
}

/**
 * getGatekeeperVaultPath
 * Just the path (no domain) — /gatekeeper-vault/<current 7-char slug>.
 * Returns null if no passphrase hash is configured yet.
 */
export async function getGatekeeperVaultPath() {
  const slug = await computeGatekeeperVaultUrlSlug();
  return slug ? `${GATEKEEPER_VAULT_PATH_PREFIX}${slug}` : null;
}

/**
 * hashGatekeeperVaultPassphrase
 * Turns a plaintext passphrase into a "salt:hash" string. Only ever run
 * offline via scripts/hashGatekeeperVaultPassphrase.js, or internally
 * by rotateGatekeeperVaultPassphrase() — never called directly from a
 * request handler with user input.
 */
export function hashGatekeeperVaultPassphrase(plaintextPassphrase) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plaintextPassphrase, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * generateGatekeeperVaultPassphrase
 * Produces a fresh, human-typable passphrase: 12 random words joined
 * with hyphens, plus a random 7-digit number. Uses crypto.randomInt
 * (cryptographically secure), never Math.random.
 */
export function generateGatekeeperVaultPassphrase() {
  const words = Array.from(
    { length: 12 },
    () => PASSPHRASE_WORD_LIST[randomInt(0, PASSPHRASE_WORD_LIST.length)]
  );
  const trailingNumber = randomInt(1000000, 10000000);
  return `${words.join("-")}-${trailingNumber}`;
}

/**
 * verifyGatekeeperVaultPassphrase
 * Constant-time compare (timingSafeEqual) against the current
 * passphrase hash so response timing can't leak how many characters
 * matched. Always derives a scrypt hash even when nothing is
 * configured, so a misconfigured value doesn't respond measurably
 * faster than a genuinely wrong passphrase would.
 */
export async function verifyGatekeeperVaultPassphrase(submittedPassphrase) {
  const storedValue = await getEffectivePassphraseHash();
  const [storedSalt, storedHashHex] = storedValue.includes(":")
    ? storedValue.split(":")
    : ["0".repeat(32), "0".repeat(SCRYPT_KEY_LENGTH * 2)];

  const submittedHash = scryptSync(submittedPassphrase, storedSalt, SCRYPT_KEY_LENGTH);
  const storedHash = Buffer.from(storedHashHex, "hex");

  if (submittedHash.length !== storedHash.length) return false;

  const isMatch = timingSafeEqual(submittedHash, storedHash);
  return isMatch && storedValue.includes(":");
}

/**
 * rotateGatekeeperVaultPassphrase
 * Generates a brand-new passphrase, hashes it, and saves the hash (plus
 * a fresh 30-day expiresAt) — overwriting whatever the passphrase used
 * to be, DB value or original .env.local value alike. Returns the
 * PLAINTEXT passphrase so the caller (the manual "Generate New
 * Passphrase" action, or the 30-day auto-rotate route) can display or
 * email it immediately. Never logged, never written anywhere else.
 */
export async function rotateGatekeeperVaultPassphrase() {
  const newPassphrase = generateGatekeeperVaultPassphrase();
  const newHash = hashGatekeeperVaultPassphrase(newPassphrase);
  const newExpiresAt = new Date(Date.now() + GATEKEEPER_VAULT_PASSPHRASE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await prisma.gatekeeperVaultPassphrase.upsert({
    where: { id: "gatekeeper_vault_passphrase" },
    update: { passphraseHash: newHash, expiresAt: newExpiresAt },
    create: { id: "gatekeeper_vault_passphrase", passphraseHash: newHash, expiresAt: newExpiresAt },
  });

  return newPassphrase;
}

/**
 * isGatekeeperVaultPassphraseExpired
 * Reads GatekeeperVaultPassphrase.expiresAt and reports whether the
 * current passphrase is due for its 30-day auto-rotation. No row yet,
 * no expiresAt yet, or a past expiresAt all count as "expired". Read
 * failures are treated as expired too (fail toward rotating).
 */
export async function isGatekeeperVaultPassphraseExpired() {
  try {
    const row = await prisma.gatekeeperVaultPassphrase.findUnique({
      where: { id: "gatekeeper_vault_passphrase" },
      select: { expiresAt: true },
    });
    if (!row?.expiresAt) return true;
    return row.expiresAt.getTime() <= Date.now();
  } catch (error) {
    console.error("[gatekeeperVaultAuth] Failed to read expiresAt:", error.message);
    return true;
  }
}

/**
 * buildGatekeeperVaultSessionCookieValue
 * Base64-encodes the session payload, mirroring the shape
 * services/vaultAuth.js uses for its own "vaultSession" cookie so the
 * pattern stays consistent across the codebase.
 */
export function buildGatekeeperVaultSessionCookieValue(uid) {
  return Buffer.from(JSON.stringify({ uid, grantedAt: Date.now() })).toString("base64");
}

/**
 * decodeGatekeeperVaultSessionCookieValue
 * Decodes the raw "gatekeeperVaultSession" cookie string and returns
 * { uid, grantedAt } only if it's well-formed and hasn't outlived
 * GATEKEEPER_VAULT_SESSION_COOKIE_MAX_AGE_SECONDS. Returns null for
 * anything missing, malformed, or expired.
 */
function decodeGatekeeperVaultSessionCookieValue(cookieValue) {
  if (!cookieValue) return null;

  try {
    const decoded = JSON.parse(Buffer.from(cookieValue, "base64").toString("utf-8"));
    if (!decoded?.uid || typeof decoded?.grantedAt !== "number") return null;

    const ageSeconds = (Date.now() - decoded.grantedAt) / 1000;
    if (ageSeconds > GATEKEEPER_VAULT_SESSION_COOKIE_MAX_AGE_SECONDS) return null;

    return decoded;
  } catch {
    return null;
  }
}

/**
 * requireGatekeeperVaultSession
 * Route Handler variant — reads the "gatekeeperVaultSession" cookie off
 * the incoming Request. Used by app/api/gatekeeper-vault/run/route.js —
 * a regular super_admin session cookie is never enough here.
 */
export function requireGatekeeperVaultSession(request) {
  return decodeGatekeeperVaultSessionCookieValue(request.cookies.get("gatekeeperVaultSession")?.value);
}

/**
 * requireGatekeeperVaultSessionFromCookieStore
 * Server Component variant — reads the cookie off the read-only cookie
 * store returned by next/headers' cookies(). Used by
 * app/gatekeeper-vault/[gatekeeperSlug]/page.jsx to redirect to the
 * login screen before rendering anything.
 */
export function requireGatekeeperVaultSessionFromCookieStore(cookieStore) {
  return decodeGatekeeperVaultSessionCookieValue(cookieStore.get("gatekeeperVaultSession")?.value);
}
