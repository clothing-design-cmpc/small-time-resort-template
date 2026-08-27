/**
 * FILE: app/superAdmin/login/otp/page.jsx
 * ROLE: Public — NOT protected by proxy.js's super_admin gate (there is
 *       no session cookie yet at this point). Reachable only after
 *       app/api/auth/login/route.js sets the "loginOtpChallenge"
 *       cookie on an anomalous-but-correct-password login — same
 *       posture as app/system-vault/[vaultSlug]/otp/page.jsx reading
 *       "vaultSession" between the vault's own passphrase and OTP steps.
 *
 * PURPOSE:
 * Second half of the Gatekeeper 3 pre-lockdown OTP challenge (see
 * services/loginAnomalyOtp.js and app/api/auth/login/route.js's file
 * header). Reads the challengeId + expiresAt out of the cookie
 * server-side and hands them to LoginOtpClient as props — the client
 * form never has to fetch its own status or carry the challenge id in
 * a URL.
 *
 * DATA FLOW:
 * 1. No "loginOtpChallenge" cookie -> nothing pending, redirect back
 *    to the normal login form.
 * 2. Cookie present -> decode { challengeId, expiresAt } and render
 *    LoginOtpClient, which posts to
 *    app/api/auth/login-otp/verify/route.js on submit and
 *    app/api/auth/login-otp/expire/route.js when its countdown runs out.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import "../Login.css";
import "./LoginOtp.css";
import LoginOtpClient from "./LoginOtpClient";

export const metadata = {
  title: "Confirm Sign-In | Super-Admin",
};

export default async function LoginOtpPage() {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get("loginOtpChallenge")?.value;

  if (!rawCookie) {
    // Nothing pending — either never started, already resolved, or the
    // cookie expired. Send back to the normal form rather than showing
    // a dead code-entry screen with nothing to submit against.
    redirect("/superAdmin/login");
  }

  let challenge;
  try {
    challenge = JSON.parse(Buffer.from(rawCookie, "base64").toString("utf8"));
  } catch {
    redirect("/superAdmin/login");
  }

  if (!challenge?.challengeId || !challenge?.expiresAt) {
    redirect("/superAdmin/login");
  }

  return (
    <section className="loginSection">
      <div className="loginOverlay" />
      <div className="loginCard">
        <div className="loginHeader">
          <span className="loginBadge" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <span className="loginEyebrow">your-private-resort Admin</span>
          <h1 className="loginTitle">Confirm Sign-In</h1>
        </div>

        <LoginOtpClient challengeId={challenge.challengeId} expiresAt={challenge.expiresAt} />
      </div>
    </section>
  );
}
