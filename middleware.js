/**
 * FILE: middleware.js
 * ROLE: Auth guard — runs before every matched route
 *
 * PURPOSE:
 * Protects account-restricted routes. The visitor area is fully public
 * and is intentionally left out of the matcher below. Once the
 * superAdmin account is scaffolded and login is built, this file will
 * decode the session cookie and enforce the superAdmin-only check.
 *
 * Protected route groups:
 *   /superAdmin/* → requires role: "superAdmin" (not yet enforced — login not built)
 *   /visitor/*    → public, no auth required, not matched by this middleware
 */
import { NextResponse } from "next/server";

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Placeholder guard — superAdmin auth is not built yet.
  // Once login exists, read the session cookie here, decode the role,
  // and redirect to /login if the role is missing or incorrect.
  if (pathname.startsWith("/superAdmin")) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

// Matcher: only run middleware on protected account routes — never on
// static files, the visitor area, or API health checks.
export const config = {
  matcher: ["/superAdmin/:path*"],
};
