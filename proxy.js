/**
 * FILE: proxy.js
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
 * 3. Proxy reads the "session" HttpOnly cookie set by
 *    app/api/auth/login/route.js on successful sign-in
 * 4. No valid session with role "super_admin" on a protected route ->
 *    redirect to /superAdmin/login
 * 5. Valid session -> request continues to the requested page
 *
 * WHY THIS FILE IS NAMED proxy.js, NOT middleware.js:
 * Next.js 16 renamed the middleware.js file convention to proxy.js —
 * the old name still works for now but is deprecated and scheduled for
 * removal in a future version (confirmed against Next 16.2.10's own
 * deprecation warning). The rename is more than cosmetic for this
 * project specifically: proxy.js ALWAYS runs on the Node.js runtime
 * and — per Next's own docs — setting `runtime` in a proxy file's
 * config now throws an error, since it can no longer be configured to
 * run on Edge. That's exactly what this file needs anyway (the pg
 * driver adapter behind isIpBlocked() requires real Node APIs Edge
 * doesn't provide), so this migration only removes a config option
 * that would otherwise have started throwing — no behavior changed.
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
//
// This super_admin check is only the FIRST factor now. The page itself
// (and GET/PATCH /api/admin/breach) additionally requires a separate
// "vaultSession" cookie, obtained only via its own passphrase login at
// /system-vault-x9f2/login (services/vaultAuth.js). That second gate is
// deliberately not enforced here in proxy.js — it's checked server-side
// in the page/route handlers themselves so it can stay independent of
// this file's session-cookie logic.
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

export async function proxy(request, event) {
  const sessionToken = request.cookies.get("session")?.value;
  const { pathname } = request.nextUrl;

  // --- GATEKEEPER IP BLOCK CHECK (3-Gatekeeper breach response) ---
  // Runs before anything else, on every matched route — visitor pages,
  // super-admin pages, and API routes alike. An IP that tripped
  // Gatekeeper 1 (login brute force) or Gatekeeper 2 (SQL injection
  // attempt) lands here and gets a flat 403 with no further detail —
  // never a reason, never a hint about which gatekeeper caught them.
  // (Blocking itself can be disabled for local testing via
  // GATEKEEPER_IP_BLOCK_DISABLED — see services/ipBlock.js's blockIp().
  // When that's set, isIpBlocked() simply never finds a row to match,
  // so this check needs no changes of its own to respect the toggle.)
  const requestIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.ip ?? null;
  if (requestIp && (await isIpBlocked(requestIp))) {
    return new NextResponse("Access denied.", { status: 403 });
  }

  // --- VISITOR PAGE VIEW TRACKING ---
  // Fire-and-forget: never awaited, so it can't add latency to the
  // actual page response. event.waitUntil keeps the function alive
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
//
// NOTE: no `runtime` option here (unlike the old middleware.js) —
// proxy.js always runs on Node.js and Next.js throws if you try to
// configure it. That's exactly the runtime this file needs anyway.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
