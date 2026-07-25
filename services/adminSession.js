/**
 * FILE: services/adminSession.js
 * PURPOSE:
 * Verifies the HttpOnly "session" cookie inside API route handlers.
 * middleware.js already guards every /superAdmin/* PAGE route, but its
 * matcher does not cover /api/*, so any admin-only API route (like
 * app/api/admin/bookings) must check authorization itself using this
 * same decode logic instead of trusting the request came from a
 * logged-in admin.
 *
 * Also exports isValidVaultSetupKey() — a second, database-independent
 * credential for app/system-vault-setup, see that function's own
 * docblock below for why it exists.
 *
 * DATA FLOW:
 * 1. An admin-only route handler calls requireSuperAdmin(request) first
 * 2. Reads and base64-decodes the "session" cookie set by
 *    app/api/auth/login/route.js — same payload shape middleware.js reads
 * 3. Returns { uid, role } on a valid super_admin session, or null
 *    otherwise, so the caller can return 401 without touching the DB
 */
import { timingSafeEqual } from "node:crypto";

/**
 * requireSuperAdmin
 * Reads the session cookie off the incoming Request and returns the
 * decoded { uid, role } payload only if role === "super_admin".
 * Returns null for a missing, malformed, or non-admin session so
 * callers can respond with a consistent 401 (Rule 28 API shape).
 */
export function requireSuperAdmin(request) {
  const sessionCookie = request.cookies.get("session")?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = JSON.parse(Buffer.from(sessionCookie, "base64").toString("utf-8"));
    if (decoded?.role !== "super_admin" || !decoded?.uid) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * requireSuperAdminFromCookieStore
 * Server Component variant — reads the "session" cookie off the
 * read-only cookie store returned by next/headers' cookies(), which
 * exposes the same .get(name) -> { value } shape as request.cookies.
 * Used by layout.jsx / page.jsx files that need the admin's identity
 * before rendering (e.g. checking AdminProfile.isOwner for owner-only
 * pages) rather than inside a Route Handler.
 */
export function requireSuperAdminFromCookieStore(cookieStore) {
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = JSON.parse(Buffer.from(sessionCookie, "base64").toString("utf-8"));
    if (decoded?.role !== "super_admin" || !decoded?.uid) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * isValidVaultSetupKey
 * Constant-time comparison of a caller-supplied setup key against
 * VAULT_SETUP_KEY — a dedicated recovery secret set once in
 * .env.local, never written to any database table.
 *
 * WHY THIS EXISTS:
 * app/system-vault-setup previously accepted only the regular
 * super-admin "session" cookie + AdminProfile.isOwner. Both of those
 * live in the database — the very thing scripts/runDatabaseWipe.js
 * truncates (admin_profiles is deliberately NOT in that script's
 * TABLES_TO_PRESERVE denylist, so a compromised admin account can
 * never be the way back in after a real wipe). That left the setup
 * page just as unreachable as everything else the moment a wipe
 * completed — backwards for a page whose whole purpose is
 * bootstrapping recovery access. VAULT_SETUP_KEY lives only in the
 * deployment's environment, so it survives a full TRUNCATE untouched
 * and reaches this one page with nothing but the secret itself — no
 * session, no admin_profiles row, no database read at all. The
 * existing session+isOwner path still works exactly as before (both
 * app/system-vault-setup/page.jsx and its API route accept EITHER
 * credential); this is an additional way in, not a replacement.
 *
 * Returns false immediately, with no comparison performed, if
 * VAULT_SETUP_KEY isn't configured at all — a deployment that never
 * set this env var behaves exactly as it did before this function
 * existed, falling back to session+isOwner only.
 *
 * @param providedKey - value read from the "x-vault-setup-key" header
 *   (API routes) or the "key" search param (page.jsx) — string, or
 *   undefined/null if the caller didn't supply one
 */
export function isValidVaultSetupKey(providedKey) {
  const configuredKey = process.env.VAULT_SETUP_KEY;
  if (!configuredKey || !providedKey) return false;

  const configuredBuffer = Buffer.from(configuredKey, "utf-8");
  const providedBuffer = Buffer.from(providedKey, "utf-8");

  // timingSafeEqual throws on mismatched buffer lengths — guard that
  // first instead of letting a length mismatch surface as an exception.
  if (configuredBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(configuredBuffer, providedBuffer);
}

/**
 * isValidWizardSetupKey
 * Constant-time comparison of a caller-supplied setup key against
 * WIZARD_SETUP_KEY — Step 1's gate for app/system-setup-wizard.
 *
 * WHY A SEPARATE KEY FROM VAULT_SETUP_KEY:
 * The two pages solve different problems and must not share a trust
 * boundary. VAULT_SETUP_KEY is a disaster-recovery master key that
 * survives a full database wipe and reaches the vault recovery flow
 * on an ALREADY-RUNNING, already-configured deployment. WIZARD_SETUP_KEY
 * gates the opposite moment in a project's life — a freshly cloned,
 * not-yet-configured repo, before any database, admin account, or
 * vault even exists. Reusing one key for both would mean whoever
 * knows the wizard key (handed out during initial setup, possibly to
 * a contractor or teammate) could also use it as a vault break-glass
 * key later, and vice versa. Generate it with:
 *   node scripts/generateEnvSecret.mjs WIZARD_SETUP_KEY
 *
 * Returns false immediately, with no comparison performed, if
 * WIZARD_SETUP_KEY isn't configured at all.
 *
 * @param providedKey - value submitted on the wizard's Step 1 form
 */
export function isValidWizardSetupKey(providedKey) {
  const configuredKey = process.env.WIZARD_SETUP_KEY;
  if (!configuredKey || !providedKey) return false;

  const configuredBuffer = Buffer.from(configuredKey, "utf-8");
  const providedBuffer = Buffer.from(providedKey, "utf-8");

  if (configuredBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(configuredBuffer, providedBuffer);
}
