/**
 * FILE: app/api/auth/logout/route.js
 * ROLE: Called by the super-admin dashboard's logout action
 *
 * PURPOSE:
 * Clears the HttpOnly "session" cookie so middleware.js immediately
 * denies further /superAdmin/* requests, sending the admin back to the
 * login page. Also sends the Clear-Site-Data header so the browser
 * wipes any cookies, storage, and cache tied to THIS origin only —
 * this never touches other origins/tabs (the browser enforces that,
 * not this code).
 *
 * DATA FLOW:
 * 1. Client calls POST /api/auth/logout (no body needed)
 * 2. This device's AdminSession row (id = the "sid" decoded from the
 *    session cookie) is deleted, freeing up one slot against
 *    SystemSettings.maxAdminSessions
 * 3. The "session" cookie is deleted from the response
 * 4. Clear-Site-Data header instructs the browser to purge this
 *    origin's cookies/storage/cache
 * 5. Client redirects to /superAdmin/login
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { deleteAdminSession } from "@/services/adminAccessLimit";

// Must match the login route's rule — Secure cookies are dropped
// outright on plain HTTP local dev, so only require it in production.
const isProduction = process.env.NODE_ENV === "production";

export async function POST(request) {
  try {
    // Free up this device's slot against the access limit BEFORE
    // clearing the cookie — best-effort, wrapped inside
    // deleteAdminSession() itself so a DB hiccup here can never block
    // sign-out.
    const sessionCookie = request.cookies.get("session")?.value;
    if (sessionCookie) {
      try {
        const decoded = JSON.parse(Buffer.from(sessionCookie, "base64").toString("utf-8"));
        await deleteAdminSession(decoded?.sid);
      } catch {
        // Malformed/legacy cookie (no "sid", e.g. a session issued
        // before this feature existed) — nothing to delete.
      }
    }

    const response = NextResponse.json({
      success: true,
      data: null,
      message: "Signed out successfully.",
    });

    // Deleting by setting maxAge 0 clears the cookie in the browser.
    response.cookies.set("session", "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });

    // Origin-Scoped Session Termination: tells the browser to purge
    // cookies, localStorage/sessionStorage, and cache for THIS origin
    // only. Spec-defined (W3C Clear-Site-Data) — cannot reach other
    // origins or other sites' tabs, only https://<this-domain>.
    // Skipped on plain HTTP local dev since the header is ignored
    // (or can error) on insecure contexts in some browsers.
    if (isProduction) {
      response.headers.set(
        "Clear-Site-Data",
        '"cookies", "storage", "cache"'
      );
    }

    return response;
  } catch (error) {
    console.error("[auth/logout] Unexpected error:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Sign out failed. Please try again." },
      { status: 500 }
    );
  }
}