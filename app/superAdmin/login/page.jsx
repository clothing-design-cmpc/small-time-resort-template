/**
 * FILE: app/superAdmin/login/page.jsx
 * ROLE: Super-admin only — the one page middleware.js always allows
 * through, since this is where an unauthenticated request gets sent
 *
 * PURPOSE:
 * Renders the sign-in form for the Villa Azure Resort admin control
 * center. This page is intentionally rendered OUTSIDE app/superAdmin/
 * layout.jsx (no Sidebar/AdminHeader) since a signed-out visitor has
 * nothing to navigate to yet.
 *
 * DATA FLOW:
 * 1. Visitor clicks "Login" in the site Header, or is redirected here
 *    by middleware.js after hitting a protected /superAdmin/* route
 * 2. Form fields are local state only — no submit handler wired yet
 * 3. Once Supabase auth is connected (Rule 35.2), submit will call
 *    a server action / API route that sets the "session" HttpOnly
 *    cookie middleware.js checks, then redirect to /superAdmin/dashboard
 */
import Image from "next/image";
import "./Login.css";

export const metadata = {
  title: "Admin Login | Villa Azure Resort",
  description: "Sign in to the Villa Azure Resort admin control center.",
};

export default function SuperAdminLoginPage() {
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
        <span className="loginEyebrow">Villa Azure Resort</span>
        <h1 className="loginTitle">Admin Login</h1>
        <p className="loginSubtitle">Sign in to access the control center.</p>

        {/* Static markup for now — submit handler and Supabase auth
            wiring land once the backend is connected (see Rule 35.2) */}
        <form className="loginForm">
          <label className="loginLabel" htmlFor="loginEmail">
            Email
          </label>
          <input
            id="loginEmail"
            name="email"
            type="email"
            autoFocus
            required
            className="loginInput"
            placeholder="you@villaazure.com"
          />

          <label className="loginLabel" htmlFor="loginPassword">
            Password
          </label>
          <input
            id="loginPassword"
            name="password"
            type="password"
            required
            className="loginInput"
            placeholder="••••••••"
          />

          <button type="submit" className="loginSubmitButton">
            Sign In
          </button>
        </form>
      </div>
    </section>
  );
}