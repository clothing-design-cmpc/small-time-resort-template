/**
 * FILE: app/superAdmin/login/otp/LoginOtpClient.jsx
 * ROLE: Standalone — not gated by proxy.js or any super_admin session;
 *       gated entirely by the challengeId this component received as
 *       a prop from the server-side page.jsx (which itself only
 *       renders once the "loginOtpChallenge" cookie is present).
 *
 * PURPOSE:
 * Gatekeeper 3 pre-lockdown OTP form: the owner enters the 6-digit
 * code emailed by services/loginAnomalyOtp.js. The code is held only
 * in this component's own React state — never written to
 * localStorage, sessionStorage, or any other client-readable storage —
 * and the actual verification always happens server-side in
 * POST /api/auth/login-otp/verify (timingSafeEqual comparison against
 * the hash stored on the LoginAnomalyChallenge row).
 *
 * DATA FLOW:
 * 1. Receives { challengeId, expiresAt } as props from page.jsx
 * 2. Runs a 1-second countdown built from expiresAt; if it reaches
 *    zero with nothing submitted, POSTs to
 *    app/api/auth/login-otp/expire/route.js (silence is never treated
 *    as approval — see that route's own header)
 * 3. Submit: POST /api/auth/login-otp/verify with { challengeId, code }
 *    — on success the route sets the normal "session" cookie and this
 *    component redirects to /superAdmin/dashboard, same as a normal
 *    clean login
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginOtpClient({ challengeId, expiresAt }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // True once the countdown hits zero and the expire call has been
  // made, or a verify attempt itself reports the challenge as closed
  // (max attempts exceeded / already expired) — the challenge is dead
  // and Gatekeeper 3 has already fired server-side by the time this
  // renders, so the form stays locked rather than letting a stale
  // code still be submitted.
  const [isWindowClosed, setIsWindowClosed] = useState(false);

  // Drives the visible countdown and fires the expire call the instant
  // it reaches zero — a setInterval tick, not a single setTimeout, so
  // the number updates every second rather than jumping straight to 0.
  useEffect(() => {
    function computeSecondsLeft() {
      return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
    }

    setSecondsLeft(computeSecondsLeft());

    const intervalId = setInterval(async () => {
      const remaining = computeSecondsLeft();
      setSecondsLeft(remaining);

      if (remaining <= 0) {
        clearInterval(intervalId);
        setIsWindowClosed(true);

        // Best-effort — the server re-checks its own stored expiresAt
        // before doing anything, so this is safe even with client
        // clock skew. A network failure here just means the breach
        // response fires a little later, off the server's own next
        // check, rather than not at all.
        try {
          await fetch("/api/auth/login-otp/expire", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ challengeId }),
          });
        } catch {
          // Nothing to show the user — the window is already closed
          // client-side regardless of whether this call lands.
        }
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [challengeId, expiresAt]);

  /**
   * onSubmit
   * Posts the entered code to /api/auth/login-otp/verify. A correct
   * code finishes the login and redirects to the dashboard; a wrong
   * code shows an inline error and leaves the countdown running,
   * unless that guess was the one that exhausted OTP_MAX_ATTEMPTS —
   * the server reports that with a 403, which locks the form here too.
   */
  async function onSubmit(event) {
    event.preventDefault();
    if (isWindowClosed) return;

    setError(null);
    setIsSubmitting(true);

    let response;
    try {
      response = await fetch("/api/auth/login-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, code }),
      });
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setIsSubmitting(false);
      return;
    }

    const result = await response.json();

    if (!result.success) {
      setError(result.message || "Incorrect or expired code.");
      setCode("");
      setIsSubmitting(false);
      if (response.status === 403) {
        setIsWindowClosed(true);
      }
      return;
    }

    router.push("/superAdmin/dashboard");
    router.refresh();
  }

  return (
    <>
      <p className="loginOtpNotice">
        This sign-in was from a device or location we haven&rsquo;t seen before. Enter the code
        emailed to the resort owner to continue.
      </p>

      {isWindowClosed ? (
        <p role="alert" className="loginAuthError">
          Time&rsquo;s up — this sign-in attempt has been closed and reported. Go back and try
          signing in again.
        </p>
      ) : (
        <form className="loginForm" onSubmit={onSubmit} noValidate>
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
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            />
            {error && (
              <span role="alert" className="loginFieldError">
                {error}
              </span>
            )}
          </div>

          <p className="loginOtpCountdown" role="status">
            Code expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </p>

          <button type="submit" className="loginSubmitButton" disabled={isSubmitting || code.length !== 6}>
            {isSubmitting ? "Confirming…" : "Confirm sign-in"}
          </button>
        </form>
      )}
    </>
  );
}
