/**
 * FILE: middleware.js
 * ROLE: Applies to all account types (visitor, superAdmin)
 *
 * PURPOSE:
 * Two jobs, in this order, for EVERY matched request:
 *   1. Gatekeeper IP block check (3-Gatekeeper breach response) — an
 *      IP that tripped Gatekeeper 1 or 2 gets a plain 403 here, before
 *      it reaches any page, any API route, visitor or super-admin alike.
 *   2. Auth guard for /superAdmin/* + the hidden recovery page — decides
 *      whether the visitor is allowed into the route they asked for.
 *
 * DATA FLOW:
 * 1. Request hits any matched route
 * 2. isIpBlocked() checks the BlockedIp table — 403 immediately if listed
 * 3. Middleware reads the "session" HttpOnly cookie set by
 *    app/api/auth/login/route.js on successful sign-in
 * 4. No valid session with role "super_admin" on a protected route ->
 *    redirect to /superAdmin/login
 * 5. Valid session -> request continues to the requested page
 *
 * NOTE ON RUNTIME: this file runs on the Node.js middleware runtime
 * (not the default Edge runtime) specifically so step 2 can query
 * Prisma/Postgres directly via the pg driver adapter — the pg package
 * needs real Node APIs (net/tls) that Edge doesn't provide. Next.js 16
 * supports this via `export const config = { runtime: "nodejs", ... }`
 * below. The role-decoding in step 3 still needs no DB call — the
 * login route is the only place that verifies password + role against
 * the database; this file only trusts what it already signed.
 */
import { NextResponse } from "next/server";
import { isIpBlocked } from "@/services/ipBlock";

// The hidden database-recovery page (3-Gatekeeper breach response,
// Task 3) is deliberately NOT under /superAdmin — it must never appear
// in the Sidebar or in any /superAdmin/* route listing. It still needs
// the exact same super_admin auth guard as every other admin page, so
// its path is added to isProtectedRoute below alongside /superAdmin.
// Only Vic and any other super-admin who already knows this URL can
// reach it — everyone else gets redirected to the normal login page
// exactly like hitting any other unauthenticated /superAdmin/* route.
const HIDDEN_RECOVERY_PATH = "/system-vault-x9f2";

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
  const { pathname } = request.nextUrl;

  // --- GATEKEEPER IP BLOCK CHECK (3-Gatekeeper breach response) ---
  // Runs before anything else, on every matched route — visitor pages,
  // super-admin pages, and API routes alike. An IP that tripped
  // Gatekeeper 1 (login brute force) or Gatekeeper 2 (SQL injection
  // attempt) lands here and gets a flat 403 with no further detail —
  // never a reason, never a hint about which gatekeeper caught them.
  const requestIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.ip ?? null;
  if (requestIp && (await isIpBlocked(requestIp))) {
    return new NextResponse("Access denied.", { status: 403 });
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

  // --- SUPER-ADMIN PAGES + API ROUTES + HIDDEN RECOVERY PAGE: only
  // accessible by role "super_admin" ---
  // Login page itself must stay reachable, or nobody could ever sign in.
  const isProtectedRoute =
    (pathname.startsWith("/superAdmin") && pathname !== "/superAdmin/login") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/superAdmin") ||
    pathname.startsWith(HIDDEN_RECOVERY_PATH);

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

// Matcher: broad catch-all so the Gatekeeper IP block check (above)
// applies to literally every route — visitor pages, super-admin pages,
// the hidden recovery page, and every API route, including /api/auth
// itself (the exact endpoint Gatekeepers 1 and 2 watch). Only static
// assets are excluded, since blocking those would break the page shell
// even for legitimate visitors sharing a CDN edge with a blocked IP is
// not a concern this app needs to solve.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
  // Node.js middleware runtime (not the default Edge runtime) — required
  // so the IP block check above can query Prisma/Postgres directly via
  // the pg driver adapter. See the file header comment for why.
  runtime: "nodejs",
};
