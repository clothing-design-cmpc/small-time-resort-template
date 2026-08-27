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
 *
 * GATEKEEPER 3 PRE-LOCKDOWN OTP CHALLENGE (services/loginAnomalyOtp.js) —
 * a correct password from an anomalous device or location (new device
 * or impossible travel) no longer fires the full breach response
 * immediately. Instead, a 6-digit code is emailed to VAULT_OWNER_EMAIL
 * and this route responds with { otpRequired: true, challengeId }
 * instead of a session cookie. app/api/auth/login-otp/verify/route.js
 * finishes the login on a correct code; app/api/auth/login-otp/expire/route.js
 * (called by the login page's own countdown) or a wrong/exhausted code
 * both fall through to the exact same Gatekeeper 3 response this route
 * used to fire directly — see prisma/schema.prisma's
 * LoginAnomalyChallenge model header for the full two-outcome flow, and
 * docs/gatekeeper-3-otp-challenge.md for the feature writeup.
 *
 * OWNER VERIFIED IP (SystemSettings.ownerVerifiedIp) — added on top of
 * the flow above, see GK3-OWNER-IP-DESIGN.txt for the full reasoning:
 * - A login attempt from this IP gets 5 attempts instead of 3 before
 *   Gatekeeper 1 fires, and a one-time magic-login-link email instead
 *   of a full breach response once that's exceeded (services/magicLogin.js).
 * - The trusted IP auto-updates itself after any CLEAN (non-anomalous)
 *   successful login from a different IP — never after an anomalous one,
 *   so a stolen-but-correct password can never claim the leniency for
 *   itself. Every auto-update fires an alert email as a safety net.
 * - A Gatekeeper 3 trip — if the OTP challenge above ultimately fails —
 *   only ever skips its IP-block step (never the lockdown/backup/
 *   rotation) when the anomaly was a NEW DEVICE from this exact IP —
 *   an IMPOSSIBLE TRAVEL trip is never exempted here, regardless of IP.
 *   Neither anomaly type skips the OTP challenge itself, only this one
 *   downstream step if the challenge fails.
 *
 * ADMIN ACCESS LIMIT (SystemSettings.maxAdminSessions) — a valid
 * super_admin login is turned away with 403 if that many devices are
 * already signed in (see services/adminAccessLimit.js). This check
 * runs AFTER role verification but BEFORE Gatekeeper 3 processing, so
 * a login blocked here never counts as "successful" and GK3 keeps
 * running normally on every login that isn't blocked by this limit.
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
import { issueMagicLoginToken } from "@/services/magicLogin";
import { sendOwnerMagicLoginEmail, sendOwnerIpUpdatedEmail } from "@/services/emailAlert";
import { getAdminAccessLimitStatus } from "@/services/adminAccessLimit";
import { buildSessionPayload, attachSessionCookie, persistAdminSession } from "@/services/loginSession";
import { createLoginAnomalyChallenge } from "@/services/loginAnomalyOtp";

const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Same 15-minute access-token lifetime pattern as Rule 32.3 — the
// session cookie mirrors the underlying Supabase access token's window.
// (SESSION_COOKIE_MAX_AGE_SECONDS itself now lives in services/loginSession.js
// so this route and app/api/auth/login-otp/verify/route.js always agree.)

// Cookies marked Secure are silently dropped by the browser on plain
// HTTP — which is exactly what `npm run dev` serves on localhost. Only
// require HTTPS once actually deployed to production.
const isProduction = process.env.NODE_ENV === "production";

// Rule 32.1 priority-endpoint default: 3 attempts per IP every 15
// minutes for any IP that isn't the verified owner IP. The owner IP
// itself gets OWNER_LOGIN_ATTEMPT_MAX instead — see the isRequestFromOwnerIp
// branch below.
const DEFAULT_LOGIN_ATTEMPT_MAX = 3;
const OWNER_LOGIN_ATTEMPT_MAX = 5;
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

  // Load the currently-trusted owner IP once, up front — used both for
  // the rate-limit tier below and for the Gatekeeper 3 exemption check
  // further down. Captured BEFORE anything in this request could change
  // it, so a successful login later in this same request can't make
  // isRequestFromOwnerIp trivially true for itself.
  let systemSettings = null;
  try {
    systemSettings = await prisma.systemSettings.findUnique({ where: { id: "singleton" } });
  } catch (error) {
    console.error("[api/auth/login] Failed to load SystemSettings:", error.message);
  }
  const storedOwnerIp = systemSettings?.ownerVerifiedIp ?? null;
  const isRequestFromOwnerIp = ip !== "unknown" && storedOwnerIp !== null && ip === storedOwnerIp;
  const loginAttemptMax = isRequestFromOwnerIp ? OWNER_LOGIN_ATTEMPT_MAX : DEFAULT_LOGIN_ATTEMPT_MAX;

  const { allowed } = await checkRateLimit(`login:${ip}`, loginAttemptMax, LOGIN_ATTEMPT_WINDOW_MS);
  if (!allowed) {
    await logSecurityEvent({
      eventType: "rate_limit_hit",
      actor: null,
      request,
      details: `Exceeded ${loginAttemptMax} login attempts within 15 minutes.`,
    });

    // OWNER-IP LENIENCY: instead of the full Gatekeeper 1 breach response
    // (which would block the owner's own IP), offer a one-time magic
    // login link emailed to the registered owner address. Still requires
    // the account to exist and be marked isOwner — if that lookup ever
    // comes back empty, fall through to the normal GK1 response below
    // rather than silently doing nothing.
    if (isRequestFromOwnerIp) {
      let ownerAdmin = null;
      try {
        ownerAdmin = await prisma.adminProfile.findFirst({ where: { isOwner: true } });
      } catch (error) {
        console.error("[api/auth/login] Failed to look up owner admin profile:", error.message);
      }

      if (ownerAdmin) {
        try {
          const rawToken = await issueMagicLoginToken(ownerAdmin.id);
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
          const magicLoginUrl = `${siteUrl}/api/auth/magic-login?token=${rawToken}`;

          await sendOwnerMagicLoginEmail({ magicLoginUrl });

          await logSecurityEvent({
            eventType: "owner_magic_login_sent",
            actor: ownerAdmin.fullName,
            request,
            details: `Sent a one-time sign-in link after ${loginAttemptMax} failed attempts from the verified owner IP.`,
          });
        } catch (error) {
          console.error("[api/auth/login] Failed to issue/send magic login link:", error.message);
        }

        return NextResponse.json(
          {
            success: false,
            data: { magicLinkSent: true },
            message:
              "Too many attempts. We've emailed a one-time sign-in link to the registered owner address — check your inbox.",
          },
          { status: 429 }
        );
      }
    }

    // GATEKEEPER 1 TRIPPED — brute force on the login endpoint. Fire the
    // full breach response (block IP, lock down the site, trigger an
    // off-cycle backup, alert super-admin). isIpBlocked() above already
    // guarantees this only runs once per attacking IP, not on every retry.
    if (ip !== "unknown") {
      await triggerGatekeeperBreach({
        gatekeeper: 1,
        ipAddress: ip,
        details: `Exceeded ${loginAttemptMax} login attempts within 15 minutes.`,
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

  // Step 2.5: Admin Access Limit — a valid super_admin login can still
  // be turned away if SystemSettings.maxAdminSessions is set and that
  // many devices/browsers are already signed in (AdminSession rows
  // that haven't expired yet). This check runs BEFORE Gatekeeper 3's
  // anomaly detection below on purpose — a login blocked here never
  // becomes a "successful login" at all, so it never enters the GK3
  // block, and GK3 keeps applying in full to every login that DOES
  // get through, exactly as before this feature existed.
  const { limitReached } = await getAdminAccessLimitStatus();
  if (limitReached) {
    // Sign the Supabase session back out — same reasoning as the
    // non-admin case above: the browser must not keep a valid Supabase
    // session for a login this app is refusing to honor.
    await adminClient.auth.admin.signOut(signInData.session.access_token).catch(() => {});

    await logSecurityEvent({
      eventType: "admin_access_limit_reached",
      actor: email,
      request,
      details: "Valid super-admin credentials, but the admin access limit is already full.",
    });

    return NextResponse.json(
      {
        success: false,
        data: { accessLimitReached: true },
        message: "Maximum number of admins allowed to access the system has been reached. Please try again later.",
      },
      { status: 403 }
    );
  }

  // Step 3: build (but don't attach yet) the session cookie payload —
  // needed below either immediately (clean login) or later, unchanged,
  // once an OTP-challenged login is approved (services/loginSession.js).
  const { sessionId, sessionPayload } = buildSessionPayload({ authUserId, role: adminProfile.role });

  const securityLogRow = await logSecurityEvent({
    eventType: "login_success",
    actor: email,
    request,
    details: `${adminProfile.fullName} signed in.`,
  });

  // Distinguish WHICH anomaly sub-type fired, if any — new-device and
  // impossible-travel get different treatment below (GK3-OWNER-IP-DESIGN.txt
  // Section 5). isAnomalous can be true for either or both; impossible
  // travel always wins when both are present.
  const isImpossibleTravel = Boolean(securityLogRow?.anomalyReason?.startsWith("Impossible travel"));
  const isNewDeviceOnly = Boolean(securityLogRow?.isNewDevice) && !isImpossibleTravel;

  if (securityLogRow?.isAnomalous && ip !== "unknown") {
    // GATEKEEPER 3 PRE-LOCKDOWN OTP CHALLENGE — a genuinely valid
    // super-admin login, but the built-in anomaly detector
    // (services/securityLog.js) flagged it as impossible travel or a
    // brand-new device. Rather than immediately firing the full breach
    // response, email a 6-digit code to the resort owner and hold this
    // login pending for OTP_EXPIRY_MINUTES — see
    // services/loginAnomalyOtp.js and prisma/schema.prisma's
    // LoginAnomalyChallenge model header for the full two-outcome flow.
    // Gatekeeper 3 still fires exactly as before if the code is wrong,
    // exhausted, or the window expires with no response — this only
    // changes the MOMENT it fires, never removes it as a safety net.
    //
    // skipIpBlock is carried on the challenge row and applied later
    // (by app/api/auth/login-otp/verify/route.js or
    // app/api/auth/login-otp/expire/route.js) only if this challenge
    // ultimately fails — same isRequestFromOwnerIp + isNewDeviceOnly
    // condition this route already used before this feature existed.
    // Impossible travel never sets this, regardless of IP.
    const skipIpBlock = isRequestFromOwnerIp && isNewDeviceOnly;

    const { challengeId, expiresAt, emailSent } = await createLoginAnomalyChallenge({
      email,
      authUserId,
      role: adminProfile.role,
      fullName: adminProfile.fullName,
      ipAddress: ip,
      deviceFingerprint: securityLogRow.deviceFingerprint ?? null,
      anomalyReason: securityLogRow.anomalyReason || `Anomalous login detected for ${email}.`,
      skipIpBlock,
    });

    // Sign the Supabase session back out — the browser must not keep a
    // valid Supabase session for a login this route hasn't finished
    // yet. The OTP-verify route re-authenticates via the challenge row
    // instead of relying on this Supabase session surviving.
    await adminClient.auth.admin.signOut(signInData.session.access_token).catch(() => {});

    const otpResponse = NextResponse.json({
      success: false,
      data: { otpRequired: true, emailSent },
      message: emailSent
        ? "This sign-in needs confirmation. We've emailed a verification code to the resort owner."
        : "This sign-in needs confirmation, but the verification email failed to send. Contact the site owner.",
    });

    // "loginOtpChallenge" cookie — same role vault's own "vaultSession"
    // cookie plays between its passphrase and OTP steps: it's what lets
    // app/superAdmin/login/otp/page.jsx (a Server Component) know a
    // challenge is pending and which one, without putting challengeId
    // in a URL. HttpOnly since the client-side OTP form never needs to
    // read it directly — it always goes through that page's own
    // server-side read. maxAge matches the challenge's own expiry so
    // the cookie never outlives what it points to.
    otpResponse.cookies.set(
      "loginOtpChallenge",
      Buffer.from(JSON.stringify({ challengeId, expiresAt })).toString("base64"),
      {
        httpOnly: true,
        secure: isProduction,
        sameSite: "strict",
        path: "/",
        maxAge: Math.max(1, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)),
      }
    );

    return otpResponse;
  } else if (ip !== "unknown" && ip !== storedOwnerIp) {
    // AUTO-UPDATE the trusted owner IP — only on a CLEAN (non-anomalous)
    // successful login. Never on an anomalous one, even though the
    // password was correct — a stolen-but-correct password must never be
    // able to claim the owner-IP leniency for its own IP going forward.
    try {
      await prisma.systemSettings.upsert({
        where: { id: "singleton" },
        update: { ownerVerifiedIp: ip, ownerVerifiedIpUpdatedAt: new Date() },
        create: { id: "singleton", ownerVerifiedIp: ip, ownerVerifiedIpUpdatedAt: new Date() },
      });

      await logSecurityEvent({
        eventType: "owner_ip_auto_updated",
        actor: email,
        request,
        details: `Verified IP updated to ${ip} after a clean successful login.`,
      });

      sendOwnerIpUpdatedEmail({ newIp: ip }).catch((error) =>
        console.error("[login] Failed to send owner-IP-updated alert email:", error.message)
      );
    } catch (error) {
      console.error("[api/auth/login] Failed to auto-update SystemSettings.ownerVerifiedIp:", error.message);
    }
  }

  const response = NextResponse.json({
    success: true,
    data: { fullName: adminProfile.fullName, role: adminProfile.role },
    message: "Signed in successfully.",
  });

  attachSessionCookie(response, sessionPayload, isProduction);

  // Track this device/browser as an active session — expiresAt mirrors
  // the cookie's own maxAge so a session that's never explicitly
  // logged out (browser crash, killed process) still stops counting
  // toward the access limit once the cookie itself would have expired.
  await persistAdminSession({ sessionId, authUserId, ipAddress: ip });

  return response;
}
