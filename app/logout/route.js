/**
 * FILE: app/logout/route.js
 * ROLE: Public — reachable by any currently signed-in super-admin
 *
 * PURPOSE:
 * Lets an admin log out just by visiting /logout directly in the
 * browser's address bar (a plain GET navigation), instead of only
 * through the AdminHeader's sign-out button. Clears the same HttpOnly
 * "session" cookie that app/api/auth/logout/route.js clears, then
 * redirects straight to the login page.
 *
 * DATA FLOW:
 * 1. Browser navigates to GET /logout
 * 2. The "session" cookie is deleted on the redirect response
 * 3. middleware.js sees no valid session on the next request and the
 *    admin lands on /superAdmin/login, fully signed out
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

// Must match the login/logout API routes' rule — Secure cookies are
// dropped outright on plain HTTP local dev, so only require it in production.
const isProduction = process.env.NODE_ENV === "production";

export async function GET(request) {
  const response = NextResponse.redirect(new URL("/superAdmin/login", request.url));

  // Deleting by setting maxAge 0 clears the cookie in the browser.
  response.cookies.set("session", "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
