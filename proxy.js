/**
 * FILE: proxy.js
 * ROLE: Applies to all account types (visitor, superAdmin)
 *
 * PURPOSE:
 * Three jobs, in this order, for EVERY matched request:
 *   1. Gatekeeper IP block check (3-Gatekeeper breach response) — an
 *      IP that tripped Gatekeeper 1 or 2 gets a plain 403 here, before
 *      it reaches any page, any API route, visitor or super-admin alike.
 *   2. Post-wipe lockdown check (Task 2) — once a scheduled database
 *      wipe actually completes, EVERY route except the hidden vault
 *      recovery page is blocked (visitor pages redirect to
 *      /maintenance, API routes get a 503) and the super-admin
 *      "session" cookie is deleted on the way out — automatic logout,
 *      no separate action needed.
 *   3. Auth guard for /superAdmin/* + the hidden recovery page — decides
 *      whether the visitor is allowed into the route they asked for.
 *
 * DATA FLOW:
 * 1. Request hits any matched route
 * 2. isIpBlocked() checks the BlockedIp table — 403 immediately if listed
 * 3. isPostWipeLockdownActive() checks SystemSettings — redirect/503 +
 *    cookie clear immediately if a wipe has completed and lockdown
 *    hasn't been lifted yet from the vault
 * 4. Proxy reads the "session" HttpOnly cookie set by
 *    app/api/auth/login/route.js on successful sign-in
 * 5. No valid session with role "super_admin" on a protected route ->
 *    redirect to /superAdmin/login
 * 6. Valid session -> request continues to the requested page
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
import { isIpBlocked, blockIp } from "@/services/ipBlock";
import { isPostWipeLockdownActive } from "@/services/postWipeLockdown";
import { isScheduledLockdownActive } from "@/services/scheduledLockdown";
import { computeVaultUrlSlug } from "@/services/vaultAuth";
import { logSecurityEvent } from "@/services/securityLog";

// The hidden database-recovery page (3-Gatekeeper breach response,
// Task 3) is deliberately NOT under /superAdmin — it must never appear
// in the Sidebar or in any /superAdmin/* route listing.
//
// STANDALONE LOGIN — NO super_admin SESSION REQUIRED:
// This page used to also require a valid super_admin "session" cookie
// as a first factor here in proxy.js, on top of its own vault
// passphrase. That coupling defeated the point of the vault having its
// own separate login: if the regular admin session was ever the thing
// compromised, an attacker with that one cookie was still only one
// passphrase away from disaster recovery. The vault is now reachable
// by anyone who knows this exact hidden URL, gated ONLY by its own
// login chain (passphrase, then email OTP — services/vaultAuth.js) —
// never by the "session" cookie proxy.js checks for /superAdmin/*.
// The IP-block check above still applies to every request regardless.
// The vault is now reachable only at whatever URL
// services/vaultAuth.js's computeVaultUrlSlug() currently resolves to
// (the first 7 hex characters of a hash of the live passphrase hash) —
// never a fixed slug like the old "/system-vault/x9f2". That check
// happens in the page itself (app/system-vault/[vaultSlug]/page.jsx
// calls notFound() on a mismatch), not here in proxy.js, so this file
// only needs a PREFIX to recognize the route family below — it never
// needs to know the current correct slug.
const HIDDEN_RECOVERY_PATH_PREFIX = "/system-vault/";

// The hidden vault PASSPHRASE SETUP page (app/system-vault-setup) — a
// separate standalone page from the recovery login above. Its whole
// reason for existing (see that page's own docblock) is to bootstrap
// or regenerate the passphrase using the normal admin "session" cookie
// as a fallback credential, precisely BECAUSE there may be no working
// vault passphrase to log in with otherwise. If this page were blocked
// during lockdown like every other route, an owner who still holds a
// valid session but has lost/forgotten the current passphrase would
// have no way back in at all — locked out of both the regular admin
// area (by lockdown) AND the vault (no known passphrase). It must
// therefore stay reachable during lockdown exactly like the vault
// login route family below; its own requireSuperAdmin()+isOwner check
// (page.jsx and its API route) still fully gates who can use it.
const HIDDEN_SETUP_PATH_PREFIX = "/system-vault-setup";
const HIDDEN_SETUP_API_PREFIX = "/api/system-vault-setup";

// The vault's own API routes must be excluded from the blanket
// "/api/admin" super_admin gate below for the same reason — they
// authenticate callers via vaultSession (and, going forward,
// verified-OTP state), never via the regular admin "session" cookie.
// Each of these routes still fully enforces its own auth internally;
// this list only controls proxy.js's coarse outer layer.
const VAULT_STANDALONE_API_PATHS = [
  "/api/admin/vault-login",
  "/api/admin/vault-otp",
  "/api/admin/breach",
  // Step 3 — Unban an IP (RecoveryClient.jsx): list + step-up code +
  // execute, all authenticated via vaultSession only, same as breach.
  "/api/admin/blocked-ips",
  // Danger Zone (VaultDangerZoneSection.jsx): status + schedule/cancel
  // + truncate-now + step-up code + grace-period confirm, all
  // authenticated via vaultSession only — mirrors /api/superAdmin/wipe
  // but reachable without a regular super-admin session.
  "/api/admin/vault-wipe",
  // Danger Zone Activity Log (VaultActivityLogSection.jsx): read-only
  // feed of the vault's own SecurityLog rows, authenticated via
  // vaultSession only — same reasoning as vault-wipe above.
  "/api/admin/vault-activity-log",
  // Environment Check (EnvCheckerSection.jsx, Task 3): read-only report
  // of which .env keys are set (never their values), authenticated via
  // vaultSession only — same reasoning as vault-wipe above.
  "/api/admin/env-check",
  // Post-Wipe Lockdown (RecoveryClient.jsx's own section): status poll
  // + "Lift Lockdown", authenticated via vaultSession only
  // (requireVaultSession + otpVerified inside the route itself — see
  // app/api/admin/post-wipe-lockdown/route.js). This route was already
  // exempted from the LOCKDOWN-BLOCK check above via
  // isPostWipeLockdownExemptPath(), but that's a separate gate from
  // this one — without also listing it here, the blanket "/api/admin
  // needs a super_admin session" guard below caught it, so the vault
  // owner's own status poll 401'd on mount and RecoveryClient's catch
  // block (any 401 == "vault session expired") bounced them straight
  // back to the vault login screen seconds after landing on the
  // dashboard, even with a perfectly valid, freshly-OTP'd vault session.
  "/api/admin/post-wipe-lockdown",
  // "Fix SQL" step (RecoveryClient.jsx) — reuses the same route the
  // normal Backups page uses, but a completed wipe already deleted the
  // super-admin session cookie by the time the vault owner reaches
  // this page (see the LOCKDOWN-BLOCK comment below). Without this
  // entry the route was double-blocked: the lockdown check 503'd it
  // outright, and even once exempted there, the blanket "/api/admin
  // needs a super_admin session" guard would still 401 it since that
  // cookie is gone. The route itself now accepts a full (otpVerified)
  // vault session as an alternative to a super-admin one — see
  // requireSuperAdminOrVaultSession() in app/api/admin/sql-import/route.js.
  "/api/admin/sql-import",
  // Gatekeeper Tester (VaultGatekeeperTesterSection.jsx): dry-runs
  // Gatekeeper 1/2 against this deployment, authenticated via
  // vaultSession only — same reasoning as vault-wipe above.
  // Previously its own standalone hidden page/passphrase
  // (app/gatekeeper-vault/[gatekeeperSlug]); moved in here so there's
  // only one hidden URL and one passphrase to manage.
  "/api/admin/gatekeeper-tester",
];

function isVaultStandaloneApiPath(pathname) {
  return VAULT_STANDALONE_API_PATHS.some((vaultPath) => pathname.startsWith(vaultPath));
}

// --- Post-Wipe Lockdown (Task 2) exemptions ---
// Everything else — every visitor page, every /superAdmin page,
// /superAdmin/login included, and every other /api route — is fully
// blocked while postWipeLockdown is active. Only these stay reachable:
//   - the maintenance page itself (so the redirect below doesn't loop)
//   - the hidden vault recovery route family (its own passphrase + OTP
//     chain is the ONLY way to lift the lockdown — see
//     app/api/admin/post-wipe-lockdown/route.js)
//   - /api/auth/logout, so the cookie-clearing redirect below can still
//     complete cleanly even if something else calls it directly
function isPostWipeLockdownExemptPath(pathname) {
  return (
    pathname === "/maintenance" ||
    pathname.startsWith(HIDDEN_RECOVERY_PATH_PREFIX) ||
    pathname.startsWith(HIDDEN_SETUP_PATH_PREFIX) ||
    pathname.startsWith(HIDDEN_SETUP_API_PREFIX) ||
    isVaultStandaloneApiPath(pathname) ||
    pathname.startsWith("/api/admin/post-wipe-lockdown") ||
    pathname.startsWith("/api/auth/logout")
  );
}

// --- Scheduled Nightly Lockdown exemptions ---
// Unlike postWipeLockdown, this is routine daily downtime, not an
// incident — the super-admin dashboard and its API routes stay fully
// reachable so staff/owner can keep working during the window if
// needed. Only the public visitor site (pages + public booking/shop
// APIs) actually goes dark. Also exempt: the maintenance page itself
// (no redirect loop), auth routes (so an admin mid-login isn't
// blocked), and the same hidden vault/setup paths postWipeLockdown
// already leaves reachable.
function isScheduledLockdownExemptPath(pathname) {
  return (
    pathname === "/maintenance" ||
    pathname.startsWith("/superAdmin") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/superAdmin") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith(HIDDEN_RECOVERY_PATH_PREFIX) ||
    pathname.startsWith(HIDDEN_SETUP_PATH_PREFIX) ||
    pathname.startsWith(HIDDEN_SETUP_API_PREFIX) ||
    isVaultStandaloneApiPath(pathname)
  );
}

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
  // DISABLED FOR NOW (per Roza, July 2026) — testing the Danger Zone
  // wipe flow was tripping this on her own IP and locking her out of
  // the site, including the vault recovery page meant to fix exactly
  // that. Feature is being held for a future pass, not deleted — flip
  // GATEKEEPER_IP_BLOCK_ENABLED="true" in .env.local to turn it back
  // on. When re-enabled, keep the /system-vault/ + vault standalone
  // API exemption below — the vault owner's own account must never be
  // able to lock itself out of the one page that can undo an IP block.
  const requestIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.ip ?? null;
  if (
    process.env.GATEKEEPER_IP_BLOCK_ENABLED === "true" &&
    requestIp &&
    pathname !== "/access-denied" &&
    !pathname.startsWith(HIDDEN_RECOVERY_PATH_PREFIX) &&
    !isVaultStandaloneApiPath(pathname) &&
    (await isIpBlocked(requestIp))
  ) {
    // API routes can't follow a redirect into an HTML page, so they
    // keep the plain JSON 403. Page requests get the styled
    // AccessDeniedScreen instead of a bare "Access denied." text blob.
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        { success: false, data: null, message: "Access denied." },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/access-denied", request.url));
  }

  // --- VAULT SLUG GUESS GUARD (Task 1) ---
  // Independent of GATEKEEPER_IP_BLOCK_ENABLED (disabled above, per
  // Roza) — this guards the hidden recovery URL itself, at the exact
  // point an attacker would be probing it, and must never be silenced
  // by the same flag that's off for an unrelated false-positive.
  // Covers page.jsx, /login, and /otp in one place — all three share
  // the HIDDEN_RECOVERY_PATH_PREFIX and were each separately calling
  // computeVaultUrlSlug() and notFound() before; this runs first, in
  // front of all three.
  //
  // Rate limit ceiling is 1 wrong attempt, not a tolerant multi-try
  // window: computeVaultUrlSlug() only ever changes on a deliberate
  // passphrase rotation, and the vault owner is emailed that new URL
  // directly at rotation time — there's no legitimate "typo" case to
  // tolerate the way there is for a password field. The first wrong
  // guess is already an attacker (or a stale pre-rotation bookmark),
  // so it gets the same permanent IP block a Gatekeeper trip would,
  // and the same styled AccessDeniedScreen — never a hint that a slug
  // check even happened.
  if (requestIp && pathname.startsWith(HIDDEN_RECOVERY_PATH_PREFIX)) {
    // Already blocked from an earlier wrong guess -> straight to
    // access-denied, never re-run the slug check or re-block.
    if (await isIpBlocked(requestIp)) {
      return NextResponse.redirect(new URL("/access-denied", request.url));
    }

    const vaultSlugSegment = pathname.slice(HIDDEN_RECOVERY_PATH_PREFIX.length).split("/")[0];
    const expectedVaultSlug = await computeVaultUrlSlug();

    if (!expectedVaultSlug || vaultSlugSegment !== expectedVaultSlug) {
      // gatekeeper: null — this isn't one of the 3 numbered Gatekeepers
      // (services/breachResponse.js), it's a standalone guard on the
      // recovery URL itself. "View Blocked IPs" already renders a null
      // gatekeeper cleanly (just the reason, no "— Gatekeeper N" suffix).
      await blockIp(requestIp, "Guessed the hidden vault recovery URL slug incorrectly.", null);
      await logSecurityEvent({
        eventType: "vault_slug_guess_blocked",
        actor: null,
        request,
        details: `IP blocked after one wrong guess at the vault recovery URL slug.`,
      });
      return NextResponse.redirect(new URL("/access-denied", request.url));
    }
  }

  // --- POST-WIPE LOCKDOWN CHECK (Task 2) ---
  // Runs right after the IP block check, before anything else — a
  // completed database wipe is treated as seriously as a live attack.
  // Visitor pages, EVERY /superAdmin page (including /superAdmin/login
  // itself — unlike the ordinary auth guard below, there is no
  // "still reachable" page here), and every API route except the
  // vault's own standalone paths are blocked. The session cookie is
  // deleted on the response itself, so a still-logged-in super-admin
  // is signed out on their very next request/click, automatically —
  // no separate "logout" action has to fire anywhere else.
  if (!isPostWipeLockdownExemptPath(pathname) && (await isPostWipeLockdownActive())) {
    if (pathname.startsWith("/api")) {
      const lockedResponse = NextResponse.json(
        { success: false, data: null, message: "This website is currently under maintenance." },
        { status: 503 }
      );
      lockedResponse.cookies.delete("session");
      return lockedResponse;
    }
    const lockedResponse = NextResponse.redirect(new URL("/maintenance", request.url));
    lockedResponse.cookies.delete("session");
    return lockedResponse;
  }

  // --- SCHEDULED NIGHTLY LOCKDOWN CHECK ---
  // Daily maintenance window (default 2:00-3:00 AM PHT, see
  // services/scheduledLockdown.js for why this is time-computed
  // instead of a DB flag toggled by a cron job). Runs after the
  // post-wipe check (that's the more severe, indefinite lockdown) but
  // before the auth guard below, so it applies to visitor pages and
  // public APIs the same way regardless of login state. The session
  // cookie is NOT cleared here — this is routine downtime, not a
  // security incident, and /superAdmin routes are exempt anyway.
  if (!isScheduledLockdownExemptPath(pathname) && isScheduledLockdownActive()) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        { success: false, data: null, message: "This website is undergoing brief nightly maintenance. Please try again shortly." },
        { status: 503 }
      );
    }
    return NextResponse.redirect(new URL("/maintenance", request.url));
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
    (pathname.startsWith("/api/admin") && !isVaultStandaloneApiPath(pathname)) ||
    pathname.startsWith("/api/superAdmin");
  // Note: HIDDEN_RECOVERY_PATH_PREFIX ("/system-vault/") is intentionally
  // NOT part of isProtectedRoute — the vault page enforces its own
  // login chain server-side (services/vaultAuth.js) instead of relying
  // on this file's super_admin session check.

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