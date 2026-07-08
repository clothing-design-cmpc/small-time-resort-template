/**
 * FILE: middleware.js
 * ROLE: Applies to all account types (visitor, superAdmin)
 *
 * PURPOSE:
 * Auth guard for the entire app. Runs before every matched request and
 * decides whether the visitor is allowed into the route they asked for.
 * Covers both the /superAdmin/* pages AND the /api/superAdmin/* data
 * routes those pages call — the visitor site and /api/bookings stay
 * fully public.
 *
 * DATA FLOW:
 * 1. Request hits a /superAdmin/* page or an /api/superAdmin/* route
 * 2. Middleware reads the "session" HttpOnly cookie set by
 *    app/api/auth/login/route.js on successful sign-in
 * 3. No valid session with role "super_admin":
 *    - page request  -> redirect to /superAdmin/login
 *    - API request   -> JSON 401 (redirecting an axios/fetch call makes
 *      no sense — the caller needs a response it can branch on)
 * 4. Valid session -> request continues to the requested page/route
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
  const userRole = decodeRole(sessionToken);

  // --- SUPER-ADMIN API ROUTES: only accessible by role "super_admin" ---
  // These previously had NO auth check of their own — each route.js file
  // only claimed protection via a comment, while the middleware matcher
  // never actually covered /api/superAdmin/*. Every one of these
  // endpoints was reachable by anyone, logged in or not.
  if (pathname.startsWith("/api/superAdmin")) {
    if (userRole !== "super_admin") {
      return NextResponse.json(
        { success: false, data: null, message: "You must be signed in as an admin to do that." },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // --- SUPER-ADMIN PAGES: only accessible by role "super_admin" ---
  // Login page itself must stay reachable, or nobody could ever sign in.
  if (pathname.startsWith("/superAdmin") && pathname !== "/superAdmin/login") {
    if (userRole !== "super_admin") {
      return NextResponse.redirect(new URL("/superAdmin/login", request.url));
    }
  }

  // Logged-in super admin visiting the login page again -> send them to
  // the dashboard instead of showing the login form (prevents re-login loop).
  if (pathname === "/superAdmin/login") {
    if (userRole === "super_admin") {
      return NextResponse.redirect(new URL("/superAdmin/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

// Matcher: covers super-admin pages AND their API routes — never static
// assets, the visitor site, or the public /api/bookings and /api/rooms
// endpoints, which must stay reachable without a session.
export const config = {
  matcher: ["/superAdmin/:path*", "/api/superAdmin/:path*"],
};
