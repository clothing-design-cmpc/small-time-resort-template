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
 * 2. Middleware reads the "session" HttpOnly cookie (not set yet — no
 *    Supabase auth is wired up on this project as of today)
 * 3. No valid session role of "superAdmin" -> redirect to /superAdmin/login
 * 4. Valid session -> request continues to the requested page
 *
 * NOTE: Session decoding is a placeholder. Wire this to real Supabase
 * session verification once auth (Rule 35.2) is connected — this file
 * only needs its decodeRole() implementation swapped out at that point.
 */
import { NextResponse } from "next/server";

/**
 * decodeRole
 * Reads the role out of the session cookie value.
 * Placeholder until Supabase auth is connected — today this always
 * returns null, which correctly sends every request to the login page.
 */
function decodeRole(sessionToken) {
  if (!sessionToken) return null;
  // TODO: replace with real Supabase session verification (Rule 35.2)
  return null;
}

export function middleware(request) {
  const sessionToken = request.cookies.get("session")?.value;
  const { pathname } = request.nextUrl;

  // --- SUPER-ADMIN ROUTES: only accessible by role "superAdmin" ---
  // Login page itself must stay reachable, or nobody could ever sign in.
  if (pathname.startsWith("/superAdmin") && pathname !== "/superAdmin/login") {
    const userRole = decodeRole(sessionToken);
    if (userRole !== "superAdmin") {
      return NextResponse.redirect(new URL("/superAdmin/login", request.url));
    }
  }

  return NextResponse.next();
}

// Matcher: only run this middleware on super-admin routes — never on
// static assets, the visitor site, or API health checks.
export const config = {
  matcher: ["/superAdmin/:path*"],
};
