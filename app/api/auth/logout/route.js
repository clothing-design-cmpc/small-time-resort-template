/**
 * FILE: app/api/auth/logout/route.js
 * ROLE: Called by the super-admin dashboard's logout action
 *
 * PURPOSE:
 * Clears the HttpOnly "session" cookie so middleware.js immediately
 * denies further /superAdmin/* requests, sending the admin back to the
 * login page.
 *
 * DATA FLOW:
 * 1. Client calls POST /api/auth/logout (no body needed)
 * 2. The "session" cookie is deleted from the response
 * 3. Client redirects to /superAdmin/login
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    data: null,
    message: "Signed out successfully.",
  });

  // Deleting by setting maxAge 0 clears the cookie in the browser.
  response.cookies.set("session", "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
