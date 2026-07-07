/**
 * FILE: app/superAdmin/login/page.jsx
 * ROLE: Public — the one page under /superAdmin reachable without a session
 *
 * PURPOSE:
 * Login form for the super-admin account. Below the password field is a
 * "Super Admin" quick-fill button that auto-fills the email and password
 * inputs with the placeholder demo credentials — speeds up local testing
 * until real Supabase auth (Rule 35.2) is wired up.
 *
 * DATA FLOW:
 * 1. User types email/password OR clicks "Super Admin" to auto-fill both fields
 * 2. React Hook Form + Zod validate on submit (Rule 31.7)
 * 3. onSubmit currently only logs intent — replace with a real
 *    supabase.auth.signInWithPassword() call once Supabase is connected
 * 4. On success, the real flow will redirect to /superAdmin/dashboard
 */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import "./Login.css";

/* Placeholder demo credentials for the quick-fill button. Replace with a
   real seeded super-admin account once Supabase auth is connected. */
const DEMO_SUPER_ADMIN_EMAIL = "superadmin@villaazure.com";
const DEMO_SUPER_ADMIN_PASSWORD = "SuperAdmin123!";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export default function SuperAdminLoginPage() {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

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
   * Placeholder submit handler — replace with a real
   * supabase.auth.signInWithPassword() call once Supabase is connected.
   */
  async function onSubmit(data) {
    // TODO: replace with real Supabase session sign-in (Rule 35.2)
    console.log("[SuperAdminLogin] submit placeholder:", data.email);
  }

  return (
    <section className="loginSection">
      <div className="loginCard">
        <span className="loginEyebrow">Villa Azure Admin</span>
        <h1 className="loginTitle">Super-Admin Login</h1>
        <p className="loginLegend">* Required fields</p>

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