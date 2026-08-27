/**
 * FILE: app/superAdmin/login/page.jsx
 * ROLE: Public — the one page under /superAdmin reachable without a session
 *
 * PURPOSE:
 * Login form for the super-admin account, rendered over the same hero
 * villa photo used on the visitor homepage with a frosted-glass card on
 * top.
 *
 * DATA FLOW:
 * 1. On mount, GET /api/auth/access-status checks whether the Admin
 *    Access Limit (Super-Admin > Settings > Admin Access Limit) is
 *    already full — if so, both inputs are disabled with an inline
 *    message instead of letting the admin fill out a form that would
 *    only be rejected afterward
 * 2. User types email/password
 * 3. React Hook Form + Zod validate on submit (Rule 31.7)
 * 4. onSubmit POSTs to /api/auth/login, which verifies the credentials
 *    against Supabase Auth + admin_profiles, checks the same access
 *    limit again server-side, and sets the "session" cookie that
 *    middleware.js reads
 * 5. On success, redirect to /superAdmin/dashboard. On failure, show an
 *    inline error banner above the form.
 */
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import IdleTimeoutNotice from "./IdleTimeoutNotice";
import "./Login.css";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

// Dev-only login autofill — see scripts/lib/envGroups.mjs's
// "devLoginAutofill" group for the full explanation. Both vars live
// only in a developer's own .env.local, which is gitignored (see
// .gitignore's `.env*` line) and therefore never present after a
// fresh `git clone` — so this button simply doesn't exist for anyone
// who hasn't deliberately set these two values themselves, with zero
// extra step required on clone. The NODE_ENV check is a second,
// independent guard so this can never render in a production build
// even if these vars were ever set somewhere they shouldn't be.
const DEV_LOGIN_EMAIL = process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL;
const DEV_LOGIN_PASSWORD = process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD;
const isDevLoginAutofillEnabled =
  process.env.NODE_ENV !== "production" && Boolean(DEV_LOGIN_EMAIL) && Boolean(DEV_LOGIN_PASSWORD);

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  // Server-side auth error (wrong credentials, not a super admin, etc.) —
  // separate from Zod field errors since it applies to the whole form.
  const [authError, setAuthError] = useState(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  // Counts consecutive failed submits so we can auto-refresh the page
  // once the 3rd one still fails — matches Gatekeeper 1's own 3-attempt
  // limit, so the user sees a clean reload right as the account would
  // be rate-limited anyway, instead of continuing to retry into a wall.

  // True only after the server confirms a one-time magic login link was
  // emailed (owner-verified-IP leniency, 5 failed attempts exceeded) —
  // swaps the error banner for a "check your email" message instead.
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Gatekeeper 3 pre-lockdown OTP challenge (services/loginAnomalyOtp.js).
  // Set once /api/auth/login responds with { otpRequired: true,
  // challengeId, expiresAt } — an anomalous-but-correct-password login
  // (new device or impossible travel). Swaps the whole form for the
  // OTP entry screen below until the code is confirmed, rejected, or
  // the countdown runs out with nothing submitted.
  const [otpChallenge, setOtpChallenge] = useState(null); // { challengeId, expiresAt } | null
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState(null);
  const [isOtpSubmitting, setIsOtpSubmitting] = useState(false);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  // True once the countdown hits zero and /api/auth/login-otp/expire has
  // been called — the challenge is closed and Gatekeeper 3 has already
  // fired server-side by the time this renders, so the form stays
  // locked rather than letting a stale code still be submitted.
  const [isOtpWindowClosed, setIsOtpWindowClosed] = useState(false);

  // Admin Access Limit (Super-Admin > Settings > Admin Access Limit) —
  // true once the configured number of admins are already signed in.
  // Checked once on mount so the form starts disabled instead of
  // letting the admin type credentials that /api/auth/login would
  // just reject anyway.
  const [isAccessLimitReached, setIsAccessLimitReached] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkAccessStatus() {
      try {
        const response = await fetch("/api/auth/access-status");
        const result = await response.json();
        if (isMounted && result.success) {
          setIsAccessLimitReached(Boolean(result.data?.limitReached));
        }
      } catch {
        // Fail open on a network error — never block a legitimate
        // login attempt just because this pre-check couldn't run.
      }
    }

    checkAccessStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  // Drives the OTP countdown display and fires the expire call the
  // instant it reaches zero — a setInterval tick, not a single
  // setTimeout, so the visible number updates every second rather than
  // just jumping from full to zero.
  useEffect(() => {
    if (!otpChallenge) return;

    function computeSecondsLeft() {
      return Math.max(0, Math.round((new Date(otpChallenge.expiresAt).getTime() - Date.now()) / 1000));
    }

    setOtpSecondsLeft(computeSecondsLeft());

    const intervalId = setInterval(async () => {
      const secondsLeft = computeSecondsLeft();
      setOtpSecondsLeft(secondsLeft);

      if (secondsLeft <= 0) {
        clearInterval(intervalId);
        setIsOtpWindowClosed(true);

        // Best-effort — the server re-checks its own stored expiresAt
        // before doing anything, so this call is safe to fire even if
        // the client's clock is slightly off. A network failure here
        // just means the breach response fires a little later, off the
        // server's own next check, rather than not at all.
        try {
          await fetch("/api/auth/login-otp/expire", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ challengeId: otpChallenge.challengeId }),
          });
        } catch {
          // Nothing to show the user here — the window is already
          // closed client-side regardless of whether this call lands.
        }
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [otpChallenge]);

  /**
   * onSubmitOtp
   * Posts the entered code to /api/auth/login-otp/verify. A correct
   * code finishes the login (same redirect as the normal onSubmit
   * below); a wrong code shows an inline error but leaves the
   * countdown running — repeated wrong guesses still count against
   * OTP_MAX_ATTEMPTS server-side even though this form doesn't track
   * an attempt count of its own.
   */
  async function onSubmitOtp(event) {
    event.preventDefault();
    if (isOtpWindowClosed) return;

    setOtpError(null);
    setIsOtpSubmitting(true);

    let response;
    try {
      response = await fetch("/api/auth/login-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: otpChallenge.challengeId, code: otpCode }),
      });
    } catch {
      setOtpError("We couldn't reach the server. Check your connection and try again.");
      setIsOtpSubmitting(false);
      return;
    }

    const result = await response.json();

    if (!result.success) {
      setOtpError(result.message || "Incorrect or expired code.");
      setOtpCode("");
      setIsOtpSubmitting(false);
      // A wrong-code response that exhausted attempts or hit an
      // already-expired challenge means Gatekeeper 3 has already fired
      // server-side (see app/api/auth/login-otp/verify/route.js) —
      // lock the form the same way the countdown reaching zero does,
      // instead of leaving a dead code input open.
      if (response.status === 403) {
        setIsOtpWindowClosed(true);
      }
      return;
    }

    router.push("/superAdmin/dashboard");
    router.refresh();
  }

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
  });

  /**
   * onSubmit
   * Posts the credentials to /api/auth/login. That route verifies them
   * against Supabase Auth, confirms the user has a super_admin
   * admin_profiles row, and sets the HttpOnly "session" cookie that
   * middleware.js reads on every /superAdmin/* request.
   */
  async function onSubmit(data) {
    setAuthError(null);

    let response;
    try {
      response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      // Network failure (server down, offline, etc.) — never let this
      // throw silently and leave the submit button stuck disabled.
      setAuthError("We couldn't reach the server. Check your connection and try again.");
      return;
    }

    const result = await response.json();

    if (!result.success) {
      // Gatekeeper 3 pre-lockdown OTP challenge — an anomalous-but-
      // correct-password login. Swap to the OTP entry screen instead
      // of treating this as a normal auth error; stop here (no reload,
      // no attempt count, no field wipe needed since the form itself
      // is about to be replaced).
      if (result.data?.otpRequired) {
        setOtpChallenge({ challengeId: result.data.challengeId, expiresAt: result.data.expiresAt });
        setAuthError(result.data.emailSent ? null : result.message);
        return;
      }

      // Owner-verified-IP leniency exceeded its 5-attempt limit — the
      // server already emailed a one-time sign-in link instead of
      // blocking this IP. Swap to a distinct message rather than the
      // normal error banner, and stop here (no reload, no attempt count).
      if (result.data?.magicLinkSent) {
        setMagicLinkSent(true);
        setValue("email", "");
        setValue("password", "");
        return;
      }

      // A slot could fill up between this page's mount-time check and
      // this exact submit — lock the form the same way the mount check
      // would have, instead of just showing a one-off error.
      if (result.data?.accessLimitReached) {
        setIsAccessLimitReached(true);
        setAuthError(result.message);
        setValue("email", "");
        setValue("password", "");
        return;
      }

      setAuthError(result.message || "Invalid email or password.");

      // Wipe both fields after every failed attempt — the person retypes
      // fresh each time rather than resubmitting a lingering wrong value,
      // and it avoids leaving a mistyped password visible on-screen.
      setValue("email", "");
      setValue("password", "");

      const nextFailedAttempts = failedAttempts + 1;
      setFailedAttempts(nextFailedAttempts);

      // 3rd consecutive failed attempt — refresh the page so the user
      // sees a clean form instead of continuing to submit into what is
      // about to become a rate-limited/blocked state (Gatekeeper 1 trips
      // at the 4th attempt for a non-owner IP; the owner IP gets 5
      // attempts plus the magic-link fallback above instead of a reload).
      if (nextFailedAttempts >= 3) {
        setTimeout(() => window.location.reload(), 1500);
      }
      return;
    }

    // Cookie is set — send the admin to the dashboard.
    router.push("/superAdmin/dashboard");
    router.refresh();
  }

  return (
    <section className="loginSection">
      {/* Same placeholder villa photo used on the visitor Hero — swap for
          real resort photography in public/images/ once R2 is connected */}
      <Image
        src="https://images.unsplash.com/photo-1759372945658-1e9f56e751bd?auto=format&fit=crop&w=2400&q=80"
        alt="Farmhouse in the countryside at twilight"
        fill
        priority
        className="loginBackgroundImage"
      />
      {/* Dark gradient overlay sits above the photo for card contrast */}
      <div className="loginOverlay" />

      {/* Returns the admin to the public visitor homepage */}
      <Link href="/visitor" className="loginBackToHome">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        Back to your-private-resort
      </Link>

      <div className="loginCard">
        <div className="loginHeader">
          {/* Icon badge gives the card a focal point instead of opening
              cold on a line of small caps eyebrow text */}
          <span className="loginBadge" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <span className="loginEyebrow">your-private-resort Admin</span>
          <h1 className="loginTitle">{otpChallenge ? "Confirm Sign-In" : "Super-Admin Login"}</h1>
          {!otpChallenge && <p className="loginLegend">* Required fields</p>}
        </div>

        {/* Gatekeeper 3 pre-lockdown OTP challenge — replaces the rest
            of the card (autofill button, notices, and the email/
            password form below) until the code is confirmed, rejected,
            or the countdown closes the window. See onSubmitOtp above
            and services/loginAnomalyOtp.js for the server side. */}
        {otpChallenge ? (
          <>
            <p className="loginOtpNotice">
              {authError ||
                "This sign-in was from a device or location we haven't seen before. Enter the code emailed to the resort owner to continue."}
            </p>

            {isOtpWindowClosed ? (
              <p role="alert" className="loginAuthError">
                Time's up — this sign-in attempt has been closed and reported. Refresh the page to try again.
              </p>
            ) : (
              <form className="loginForm" onSubmit={onSubmitOtp} noValidate>
                <div className="loginField">
                  <label htmlFor="otpCode">
                    Verification code <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="otpCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ""))}
                  />
                  {otpError && (
                    <span role="alert" className="loginFieldError">
                      {otpError}
                    </span>
                  )}
                </div>

                <p className="loginOtpCountdown" role="status">
                  Code expires in {Math.floor(otpSecondsLeft / 60)}:{String(otpSecondsLeft % 60).padStart(2, "0")}
                </p>

                <button
                  type="submit"
                  className="loginSubmitButton"
                  disabled={isOtpSubmitting || otpCode.length !== 6}
                >
                  {isOtpSubmitting ? "Confirming…" : "Confirm sign-in"}
                </button>
              </form>
            )}
          </>
        ) : (
          <>
        {/* Dev-only convenience — never renders in production or on a
            fresh clone (see DEV_LOGIN_EMAIL/PASSWORD above). Fills the
            form only; still requires a real submit through the normal
            /api/auth/login flow, so it never bypasses any auth check. */}
        {isDevLoginAutofillEnabled && (
          <button
            type="button"
            className="loginDevAutofillButton"
            onClick={() => {
              setValue("email", DEV_LOGIN_EMAIL);
              setValue("password", DEV_LOGIN_PASSWORD);
            }}
          >
            Autofill dev login
          </button>
        )}

        {/* Shown only after an idle-timeout redirect (?reason=idle-timeout) —
            wrapped in Suspense because useSearchParams() requires it. */}
        <Suspense fallback={null}>
          <IdleTimeoutNotice />
        </Suspense>

        {/* Shown only after the server emails a one-time magic login link
            (owner-verified-IP leniency, 5 failed attempts exceeded) —
            takes priority over the normal error banner below. */}
        {magicLinkSent && (
          <p role="status" className="loginMagicLinkNotice">
            Too many attempts. We've emailed a one-time sign-in link to the registered owner
            address — check your inbox. The link expires in 10 minutes.
          </p>
        )}

        {/* Access limit reached — takes priority over the normal error
            banner and the magic-link notice, since the whole form is
            unusable in this state regardless of what was just typed. */}
        {isAccessLimitReached && (
          <p role="alert" className="loginAuthError">
            {authError ||
              "Maximum number of admins allowed to access the system has been reached. Please try again later."}
          </p>
        )}

        {/* Whole-form auth error — wrong credentials, not a super admin,
            or a network failure. Field-level Zod errors render separately
            below each input. */}
        {!isAccessLimitReached && !magicLinkSent && authError && (
          <p role="alert" className="loginAuthError">
            {authError}
          </p>
        )}

        <form className="loginForm" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="loginField">
            <label htmlFor="email">
              Email <span aria-hidden="true">*</span>
            </label>
            <input
              id="email"
              type="email"
              autoFocus
              autoComplete="email"
              disabled={isAccessLimitReached}
              {...register("email")}
            />
            {errors.email && (
              <span role="alert" className="loginFieldError">
                {errors.email.message}
              </span>
            )}
          </div>

          <div className="loginField">
            <label htmlFor="password">
              Password <span aria-hidden="true">*</span>
            </label>
            <div className="loginPasswordWrapper">
              <input
                id="password"
                type={isPasswordVisible ? "text" : "password"}
                autoComplete="current-password"
                disabled={isAccessLimitReached}
                {...register("password")}
              />
              {/* Show/hide toggle — required on every password field per Rule 34.3 */}
              <button
                type="button"
                className="loginPasswordToggle"
                onClick={() => setIsPasswordVisible((visible) => !visible)}
                aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                disabled={isAccessLimitReached}
              >
                {isPasswordVisible ? "Hide" : "Show"}
              </button>
            </div>
            {errors.password && (
              <span role="alert" className="loginFieldError">
                {errors.password.message}
              </span>
            )}
          </div>

          <button type="submit" className="loginSubmitButton" disabled={isSubmitting || isAccessLimitReached}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
          </>
        )}
      </div>
    </section>
  );
}