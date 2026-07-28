/**
 * FILE: app/superAdmin/login/page.jsx
 * ROLE: Public — the one page under /superAdmin reachable without a session
 *
 * PURPOSE:
 * Login form for the super-admin account, rendered over the same hero
 * villa photo used on the visitor homepage with a frosted-glass card on
 * top. Below the password field is a "Super Admin" quick-fill button
 * that auto-fills the demo credentials for local testing.
 *
 * DATA FLOW:
 * 1. User types email/password OR clicks "Super Admin" to auto-fill both fields
 * 2. React Hook Form + Zod validate on submit (Rule 31.7)
 * 3. onSubmit POSTs to /api/auth/login, which verifies the credentials
 *    against Supabase Auth + admin_profiles and sets the "session" cookie
 *    that middleware.js reads
 * 4. On success, redirect to /superAdmin/dashboard. On failure, show an
 *    inline error banner above the form.
 */
"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import IdleTimeoutNotice from "./IdleTimeoutNotice";
import "./Login.css";

/* Placeholder demo credentials for the quick-fill button. Must match the
   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD used by prisma/seed.js. */
const DEMO_SUPER_ADMIN_EMAIL = "superadmin@your-private-resort.com";
const DEMO_SUPER_ADMIN_PASSWORD = "superadmin123";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

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

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
  });

  /**
   * fillSuperAdminDemoCredentials
   * Fills the email and password fields with the placeholder super-admin
   * credentials so a developer can log in instantly during local testing.
   * setValue with shouldValidate re-runs Zod validation immediately so the
   * form is submit-ready without the user needing to touch either field.
   */
  function fillSuperAdminDemoCredentials() {
    setValue("email", DEMO_SUPER_ADMIN_EMAIL, { shouldValidate: true });
    setValue("password", DEMO_SUPER_ADMIN_PASSWORD, { shouldValidate: true });
  }

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
          <h1 className="loginTitle">Super-Admin Login</h1>
          <p className="loginLegend">* Required fields</p>
        </div>

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

        {/* Whole-form auth error — wrong credentials, not a super admin,
            or a network failure. Field-level Zod errors render separately
            below each input. */}
        {!magicLinkSent && authError && (
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
                {...register("password")}
              />
              {/* Show/hide toggle — required on every password field per Rule 34.3 */}
              <button
                type="button"
                className="loginPasswordToggle"
                onClick={() => setIsPasswordVisible((visible) => !visible)}
                aria-label={isPasswordVisible ? "Hide password" : "Show password"}
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

          {/* Quick-fill shortcut — auto-fills both fields with the demo
              super-admin credentials so testing never requires retyping them. */}
          <button
            type="button"
            className="loginSuperAdminFillButton"
            onClick={fillSuperAdminDemoCredentials}
          >
            Super Admin
          </button>

          <button type="submit" className="loginSubmitButton" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </section>
  );
}