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
 * DATA FLOW:
 * 1. An admin-only route handler calls requireSuperAdmin(request) first
 * 2. Reads and base64-decodes the "session" cookie set by
 *    app/api/auth/login/route.js — same payload shape middleware.js reads
 * 3. Returns { uid, role } on a valid super_admin session, or null
 *    otherwise, so the caller can return 401 without touching the DB
 */

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
