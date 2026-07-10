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
 * Also runs the reseller license check (services/licenseGuard.js) on
 * every matched request — this is a separate concern from the auth
 * guard below (it doesn't care WHO is visiting, only whether THIS
 * deployment/domain is still an authorized copy of the template).
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
import { checkLicense } from "@/services/licenseGuard";

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

export async function middleware(request, event) {
  const sessionToken = request.cookies.get("session")?.value;
  const { pathname, hostname } = request.nextUrl;

  // --- RESELLER LICENSE CHECK ---
  // Runs before anything else. Confirms this domain is still an
  // authorized copy of the template. Never runs on its own page (that
  // would be an infinite redirect loop) or on API routes (an API
  // consumer expects JSON, not a redirect).
  if (pathname !== "/license-invalid" && !pathname.startsWith("/api")) {
    const license = await checkLicense(hostname);
    if (!license.valid) {
      return NextResponse.redirect(new URL("/license-invalid", request.url));
    }
  }

  // --- VISITOR PAGE VIEW TRACKING ---
  // Fire-and-forget: never awaited, so it can't add latency to the
  // actual page response. event.waitUntil keeps the Edge function alive
  // long enough for the fetch to actually go out before the runtime
  // recycles it. Only real visitor pages are tracked — not the
  // super-admin area, not API routes, not the login page.
  const isTrackableVisitorPage =
    request.method === "GET" &&
    (pathname === "/" || pathname.startsWith("/visitor")) &&
    !pathname.startsWith("/api");

  if (isTrackableVisitorPage) {
    const trackingRequest = fetch(new URL("/api/visitor-log/track", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Forward the visitor's real IP/user-agent through to the Node
        // route, which can't otherwise see the original client request.
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? request.ip ?? "",
        "user-agent": request.headers.get("user-agent") ?? "",
      },
      body: JSON.stringify({ path: pathname }),
    }).catch(() => {
      // Best-effort telemetry — a failed tracking call must never affect the visitor.
    });

    if (event?.waitUntil) event.waitUntil(trackingRequest);
  }

  // --- SUPER-ADMIN PAGES + API ROUTES: only accessible by role "super_admin" ---
  // Login page itself must stay reachable, or nobody could ever sign in.
  const isProtectedRoute =
    (pathname.startsWith("/superAdmin") && pathname !== "/superAdmin/login") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/superAdmin");

  if (isProtectedRoute) {
    const userRole = decodeRole(sessionToken);
    if (userRole !== "super_admin") {
      // API routes get a JSON 401, not a redirect — a fetch() call can't follow a redirect into an HTML login page.
      if (pathname.startsWith("/api/admin") || pathname.startsWith("/api/superAdmin")) {
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

// Matcher: super-admin pages + admin API routes (auth guard), plus the
// visitor site's own pages (page-view tracking only — no auth guard
// applies there). Never runs on static assets.
export const config = {
  matcher: ["/superAdmin/:path*", "/api/admin/:path*", "/api/superAdmin/:path*", "/", "/visitor/:path*"],
};
