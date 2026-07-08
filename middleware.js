/**
 * FILE: middleware.js
 * ROLE: Applies to all account types (visitor, superAdmin)
 *
 * PURPOSE:
 * Auth guard for the entire app. Runs before every matched request and
 * decides whether the visitor is allowed into the route they asked for.
 * Only the /superAdmin/* route group is protected right now — the
 * visitor site stays fully public.
 *
 * DATA FLOW:
 * 1. Request hits a /superAdmin/* route
 * 2. Middleware reads the "session" HttpOnly cookie set by
 *    app/api/auth/login/route.js on successful sign-in
 * 3. No valid session with role "super_admin" -> redirect to /superAdmin/login
 * 4. Valid session -> request continues to the requested page
 *
 * NOTE: The cookie is decoded locally (no DB call) because middleware
 * runs on the Edge runtime, which cannot reach Prisma/Postgres. The
 * login route is the only place that verifies the password and role
 * against the database — this file only trusts what it already signed.
 */
import { NextResponse } from "next/server";

/**
 * decodeRole
 * Reads the role out of the session cookie value. The cookie is a
 * base64-encoded JSON payload of { uid, role } set by
 * app/api/auth/login/route.js after Supabase Auth + admin_profiles
 * verification succeeds. Returns null on any missing/malformed cookie
 * so the request is treated as unauthenticated.
 */
function decodeRole(sessionToken) {
  if (!sessionToken) return null;
  try {
    const decoded = JSON.parse(Buffer.from(sessionToken, "base64").toString("utf-8"));
    return decoded?.role ?? null;
  } catch {
    return null;
  }
}

export function middleware(request) {
  const sessionToken = request.cookies.get("session")?.value;
  const { pathname } = request.nextUrl;

  // --- SUPER-ADMIN PAGES + API ROUTES: only accessible by role "super_admin" ---
  // Login page itself must stay reachable, or nobody could ever sign in.
  const isProtectedRoute =
    (pathname.startsWith("/superAdmin") && pathname !== "/superAdmin/login") ||
    pathname.startsWith("/api/admin");

  if (isProtectedRoute) {
    const userRole = decodeRole(sessionToken);
    if (userRole !== "super_admin") {
      // API routes get a JSON 401, not a redirect — a fetch() call can't follow a redirect into an HTML login page.
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json(
          { success: false, data: null, message: "You don't have permission to do this." },
          { status: 401 }
        );
      }
      return NextResponse.redirect(new URL("/superAdmin/login", request.url));
    }
  }

  // Logged-in super admin visiting the login page again -> send them to
  // the dashboard instead of showing the login form (prevents re-login loop).
  if (pathname === "/superAdmin/login") {
    const userRole = decodeRole(sessionToken);
    if (userRole === "super_admin") {
      return NextResponse.redirect(new URL("/superAdmin/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

// Matcher: only run this middleware on super-admin pages + admin API routes
// — never on static assets, the visitor site, or public API routes.
export const config = {
  matcher: ["/superAdmin/:path*", "/api/admin/:path*"],
};
