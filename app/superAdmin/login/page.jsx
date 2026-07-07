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

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import "./Login.css";

/* Placeholder demo credentials for the quick-fill button. Must match the
   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD used by prisma/seed.js. */
const DEMO_SUPER_ADMIN_EMAIL = "superadmin@villaazure.com";
const DEMO_SUPER_ADMIN_PASSWORD = "SuperAdmin123!";

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

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();

    if (!result.success) {
      setAuthError(result.message || "Invalid email or password.");
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
        alt="Tropical villa with a private pool at twilight"
        fill
        priority
        className="loginBackgroundImage"
      />
      {/* Dark gradient overlay sits above the photo for card contrast */}
      <div className="loginOverlay" />

      <div className="loginCard">
        <span className="loginEyebrow">Villa Azure Admin</span>
        <h1 className="loginTitle">Super-Admin Login</h1>
        <p className="loginLegend">* Required fields</p>

        {/* Whole-form auth error — wrong credentials, not a super admin,
            or a network failure. Field-level Zod errors render separately
            below each input. */}
        {authError && (
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