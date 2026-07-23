/**
 * FILE: app/api/auth/login/route.js
 * ROLE: Public endpoint — called by app/superAdmin/login/page.jsx only
 *
 * PURPOSE:
 * Verifies the submitted email/password against Supabase Auth, confirms
 * the signed-in user has a super_admin row in admin_profiles, and sets
 * the HttpOnly "session" cookie that proxy.js reads to guard every
 * other /superAdmin/* route.
 *
 * DATA FLOW:
 * 1. Client POSTs { email, password } as JSON
 * 2. Zod validates the shape before touching Supabase
 * 3. browserClient.auth.signInWithPassword() verifies the credentials
 *    against Supabase Auth (this uses the anon key — correct for a
 *    plain sign-in call, it does not bypass RLS)
 * 4. adminClient looks up admin_profiles by the returned user id to
 *    confirm the account is actually a super_admin — a valid Supabase
 *    login alone is not enough to reach the admin area
 * 5. On success, an HttpOnly/Secure/SameSite=strict "session" cookie is
 *    set containing the user id + role so proxy.js (edge runtime,
 *    no DB access) can authorize requests without a network call
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { browserClient, adminClient } from "@/services/supabase";
import { prisma } from "@/services/prisma";
import { logSecurityEvent } from "@/services/securityLog";
import { checkRateLimit } from "@/services/rateLimit";
import { scanForSqlInjection } from "@/services/sqlInjectionGuard";
import { isIpBlocked } from "@/services/ipBlock";
import { triggerGatekeeperBreach } from "@/services/breachResponse";

const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Same 15-minute access-token lifetime pattern as Rule 32.3 — the
// session cookie mirrors the underlying Supabase access token's window.
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Cookies marked Secure are silently dropped by the browser on plain
// HTTP — which is exactly what `npm run dev` serves on localhost. Only
// require HTTPS once actually deployed to production.
const isProduction = process.env.NODE_ENV === "production";

// Rule 32.1 priority-endpoint limit: 3 attempts per IP every 15 minutes —
// this is the single most important brute-force guard on the whole app.
const LOGIN_ATTEMPT_MAX = 3;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // GATEKEEPER 1 check happens before anything else — an already-blocked
  // IP should never even reach the rate limiter (proxy.js should
  // have already 403'd it, but this is a second layer of defense in
  // case this route is ever reached directly).
  if (ip !== "unknown" && (await isIpBlocked(ip))) {
    return NextResponse.json(
      { success: false, data: null, message: "Access denied." },
      { status: 403 }
    );
  }

  const { allowed } = await checkRateLimit(`login:${ip}`, LOGIN_ATTEMPT_MAX, LOGIN_ATTEMPT_WINDOW_MS);
  if (!allowed) {
    await logSecurityEvent({
      eventType: "rate_limit_hit",
      actor: null,
      request,
      details: `Exceeded ${LOGIN_ATTEMPT_MAX} login attempts within 15 minutes.`,
    });

    // GATEKEEPER 1 TRIPPED — brute force on the login endpoint. Fire the
    // full breach response (block IP, lock down the site, trigger an
    // off-cycle backup, alert super-admin). isIpBlocked() above already
    // guarantees this only runs once per attacking IP, not on every retry.
    if (ip !== "unknown") {
      await triggerGatekeeperBreach({
        gatekeeper: 1,
        ipAddress: ip,
        details: `Exceeded ${LOGIN_ATTEMPT_MAX} login attempts within 15 minutes.`,
      }).catch((error) => console.error("[login] Gatekeeper 1 breach response failed:", error.message));
    }

    return NextResponse.json(
      { success: false, data: null, message: "Too many attempts. Please try again in 15 minutes." },
      { status: 429 }
    );
  }

  // Fail fast with a clear message if Supabase env vars were never set —
  // otherwise the SDK throws a low-level fetch error that just looks
  // like "login isn't working" with no indication why.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error(
      "[api/auth/login] Missing Supabase env vars — set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in .env.local (see .env.local.example)."
    );
    return NextResponse.json(
      { success: false, data: null, message: "Server auth is not configured yet. Check .env.local." },
      { status: 500 }
    );
  }

  let payload;
  try {
    payload = loginRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Enter a valid email and password." },
      { status: 400 }
    );
  }

  // Defense-in-depth detection layer (Prisma already makes real SQL
  // injection structurally impossible — this just logs the attempt).
  const sqliHit = scanForSqlInjection(payload);
  if (sqliHit) {
    await logSecurityEvent({
      eventType: "sql_injection_attempt",
      actor: typeof payload.email === "string" ? payload.email : null,
      request,
      details: `Suspicious pattern detected in field "${sqliHit}" on login.`,
    });

    // GATEKEEPER 2 TRIPPED — an actual attack pattern reached the login
    // endpoint. This is a stronger signal than the rate limiter (Gatekeeper 1)
    // since it means the payload itself, not just the volume, looked malicious.
    if (ip !== "unknown") {
      await triggerGatekeeperBreach({
        gatekeeper: 2,
        ipAddress: ip,
        details: `SQL injection pattern detected in field "${sqliHit}" on login.`,
      }).catch((error) => console.error("[login] Gatekeeper 2 breach response failed:", error.message));
    }

    return NextResponse.json(
      { success: false, data: null, message: "Enter a valid email and password." },
      { status: 400 }
    );
  }

  // Normalize email (trim + lowercase) before hitting Supabase, per the
  // field normalization standard — prevents casing/whitespace mismatches.
  const email = payload.email.trim().toLowerCase();
  const password = payload.password;

  // Step 1: verify the password against Supabase Auth.
  let signInData;
  let signInError;
  try {
    ({ data: signInData, error: signInError } =
      await browserClient.auth.signInWithPassword({ email, password }));
  } catch (networkError) {
    console.error("[api/auth/login] Supabase request failed:", networkError.message);
    return NextResponse.json(
      { success: false, data: null, message: "Couldn't reach the auth server. Please try again." },
      { status: 502 }
    );
  }

  // Always return the same generic message for wrong email vs wrong
  // password — never reveal which one failed (Rule 32.4).
  if (signInError || !signInData?.user) {
    if (signInError) {
      console.error("[api/auth/login] signInWithPassword failed:", signInError.message);
    }
    // Logged with the attempted email so repeated failures against the
    // same address (brute force) or a spread of addresses (credential
    // stuffing) both show up clearly in the Security Logs page.
    await logSecurityEvent({
      eventType: "login_failed",
      actor: email,
      request,
      details: "Invalid email or password.",
    });
    return NextResponse.json(
      { success: false, data: null, message: "Invalid email or password." },
      { status: 401 }
    );
  }

  const authUserId = signInData.user.id;

  // Step 2: confirm this Auth user is actually a super admin. A valid
  // Supabase login is not sufficient on its own to reach /superAdmin.
  let adminProfile;
  try {
    adminProfile = await prisma.adminProfile.findUnique({
      where: { id: authUserId },
    });
  } catch (lookupError) {
    console.error("[api/auth/login] admin_profiles lookup failed:", lookupError.message);
    return NextResponse.json(
      { success: false, data: null, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }

  if (!adminProfile || adminProfile.role !== "super_admin") {
    // Sign the Supabase session back out — the browser must not keep a
    // valid Supabase session for an account that isn't authorized here.
    await adminClient.auth.admin.signOut(signInData.session.access_token).catch(() => {});
    // This is a MORE serious signal than a plain login_failed — it means
    // someone had a genuinely valid Supabase password but isn't an admin.
    await logSecurityEvent({
      eventType: "admin_login_denied",
      actor: email,
      request,
      details: "Valid Supabase credentials, but this account has no super_admin role.",
    });
    return NextResponse.json(
      { success: false, data: null, message: "This account does not have admin access." },
      { status: 403 }
    );
  }

  // Step 3: set the HttpOnly session cookie proxy.js decodes.
  const sessionPayload = Buffer.from(
    JSON.stringify({ uid: authUserId, role: adminProfile.role })
  ).toString("base64");

  const securityLogRow = await logSecurityEvent({
    eventType: "login_success",
    actor: email,
    request,
    details: `${adminProfile.fullName} signed in.`,
  });

  // GATEKEEPER 3 TRIPPED — a genuinely valid super-admin login, but the
  // built-in anomaly detector (services/securityLog.js) flagged it as
  // impossible travel or a brand-new device. This is the most serious
  // of the three signals: it means someone already has the correct
  // password. Fire the full breach response even though the password
  // was correct — a compromised credential is exactly what this gate exists for.
  if (securityLogRow?.isAnomalous && ip !== "unknown") {
    await triggerGatekeeperBreach({
      gatekeeper: 3,
      ipAddress: ip,
      details: securityLogRow.anomalyReason || `Anomalous login detected for ${email}.`,
    }).catch((error) => console.error("[login] Gatekeeper 3 breach response failed:", error.message));
  }

  const response = NextResponse.json({
    success: true,
    data: { fullName: adminProfile.fullName, role: adminProfile.role },
    message: "Signed in successfully.",
  });

  response.cookies.set("session", sessionPayload, {
    httpOnly: true,
    // Secure cookies are dropped outright on plain HTTP — only enforce
    // it in production where the app is served over HTTPS.
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
