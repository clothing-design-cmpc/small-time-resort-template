/**
 * FILE: app/system-vault/[vaultSlug]/otp/VaultOtpClient.jsx
 * ROLE: Standalone — not gated by proxy.js or any super_admin session;
 *       gated entirely by the (already-passphrase-verified) vaultSession
 *       cookie the two API calls below rely on.
 *
 * PURPOSE:
 * Second-factor form: fires the send-code request once on mount, then
 * lets the owner type in the 12-character code from their email. The code
 * is held only in this component's own React state — never written to
 * localStorage, sessionStorage, or any other client-readable storage —
 * and the actual verification always happens server-side in
 * PATCH /api/admin/vault-otp (services/vaultOtp.js's timingSafeEqual
 * comparison against the hash stored in the database).
 *
 * DATA FLOW:
 * 1. On mount: POST /api/admin/vault-otp — generates + emails a code
 * 2. Owner reads the code from their inbox and types it in
 * 3. Submit: PATCH /api/admin/vault-otp with { code } — on success the
 *    route re-issues "vaultSession" with otpVerified: true
 * 4. Redirect to this same slug's root, which now passes its
 *    server-side check and renders the recovery dashboard
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { OTP_EXPIRY_MINUTES, OTP_CODE_LENGTH, OTP_CODE_PATTERN } from "@/services/vaultOtpConfig";

// Total countdown length in seconds — mirrors the server's real expiry
// (services/vaultOtp.js) via the shared config, so the on-screen clock
// never drifts from what the backend actually enforces.
const OTP_COUNTDOWN_SECONDS = OTP_EXPIRY_MINUTES * 60;

const vaultOtpSchema = z.object({
  // Pasting the code from an email almost always drags in a leading/
  // trailing space or newline (the code sits alone on its own line in
  // the template) — trim BEFORE the exact-shape regex runs, or a
  // correctly-typed code fails validation for a reason the owner can't
  // see or reproduce by re-typing it.
  code: z.preprocess(
    (val) => (typeof val === "string" ? val.trim() : val),
    z
      .string()
      .min(1, "Enter the code from your email.")
      // Length is checked separately from the character-shape check so
      // a short paste (e.g. the email's highlight box clipping the
      // last character on selection — a known risk with fixed-width
      // HTML email boxes) tells the owner exactly what's wrong instead
      // of a generic "wrong format" message that looks identical
      // whether they're missing one character or typed complete
      // nonsense.
      .superRefine((value, ctx) => {
        if (value.length !== OTP_CODE_LENGTH) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `You entered ${value.length} of ${OTP_CODE_LENGTH} characters. Go back to the email and make sure the WHOLE code is selected — triple-click the code to select the full line, then copy again.`,
          });
          return;
        }
        if (!OTP_CODE_PATTERN.test(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `That doesn't match the code format. Copy it directly from the email rather than retyping it.`,
          });
        }
      })
  ),
});

/**
 * formatCountdown
 * Turns a whole-second count into an "m:ss" display string, e.g. 65 -> "1:05".
 */
function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function VaultOtpClient() {
  const router = useRouter();
  // The current URL's own slug — never hardcoded, since it changes on
  // every passphrase rotation (services/vaultAuth.js's computeVaultUrlSlug).
  const { vaultSlug } = useParams();
  // Whole-form auth error (wrong/expired code, rate limited, network
  // failure) — separate from the single field's own Zod error.
  const [authError, setAuthError] = useState(null);
  const [sendStatus, setSendStatus] = useState({ state: "sending", message: "" });
  // Counts down from OTP_COUNTDOWN_SECONDS every time a fresh code is
  // sent (initial load or "Resend code"). isCodeExpired flips true the
  // instant it hits zero — used to disable the code input and turn the
  // resend button into the primary action.
  const [secondsRemaining, setSecondsRemaining] = useState(OTP_COUNTDOWN_SECONDS);
  const [isCodeExpired, setIsCodeExpired] = useState(false);
  // Live "n / 12" counter shown under the input — the fastest way for
  // the owner to notice a short paste (e.g. the email highlight box
  // clipping the last character) before ever hitting Submit.
  const [codeLength, setCodeLength] = useState(0);
  const countdownIntervalRef = useRef(null);
  // Guards against React 18/19 StrictMode's double-invoke of effects in
  // development, which would otherwise fire two send requests (and two
  // emails) for a single page load.
  const hasSentOnce = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(vaultOtpSchema) });

  // register() gives back { name, onChange, onBlur, ref } for the
  // "code" field — pulled apart here so its onChange can be wrapped
  // with an ACTIVE length + whitespace guard below (handleCodeChange),
  // instead of relying on the input's native maxLength attribute.
  // IMPORTANT: this is NOT "belt and suspenders" — the two are NOT
  // safe to combine. The browser enforces maxLength on the RAW pasted
  // text before this onChange ever fires, so a paste that picks up one
  // stray leading/trailing space (the code sits alone on its own line
  // in the email template, which reliably grabs one) gets truncated to
  // OTP_CODE_LENGTH characters BY THE BROWSER first — with that
  // whitespace occupying one of the slots — and handleCodeChange's
  // trim() then only ever sees the already-mutilated 11-real-character
  // result. There must be no maxLength attribute on the <input> below;
  // handleCodeChange enforces the limit entirely in JS, on the
  // untouched raw value, which is the only way that's actually correct.
  const codeField = register("code");

  /**
   * handleCodeChange
   * Trims whitespace FIRST, then truncates to OTP_CODE_LENGTH — in that
   * order, deliberately. The email text the owner copies often carries
   * a leading or trailing space/newline (the code sits alone on its
   * own line in the template). If truncation ran on the raw value
   * before trimming, a leading whitespace character would occupy one
   * of the 12 slots and the slice would cut off the code's real last
   * character instead — the field would show "12/12" (true of the raw
   * value) while the actual code underneath was only 11 real
   * characters, exactly the mismatch between the live counter and the
   * submit-time validation error this was built to prevent. Trimming
   * first means only real code characters ever compete for the 12
   * slots. Mutates event.target.value in place before handing off to
   * react-hook-form's own onChange, so validation and form state stay
   * in sync with the sanitized value rather than the raw one.
   */
  function handleCodeChange(event) {
    const trimmedValue = event.target.value.trim();
    event.target.value = trimmedValue.length > OTP_CODE_LENGTH ? trimmedValue.slice(0, OTP_CODE_LENGTH) : trimmedValue;
    setCodeLength(event.target.value.length);
    codeField.onChange(event);
  }

  // Fires once when the screen loads — the owner shouldn't have to
  // click a button just to get the first code.
  useEffect(() => {
    if (hasSentOnce.current) return;
    hasSentOnce.current = true;
    // forceNew: false — if a valid code already exists (e.g. this
    // effect re-firing on a page refresh or dev Fast Refresh), reuse
    // it instead of silently invalidating whatever's already in the
    // owner's inbox.
    sendCode(false);

    // Stop the interval if the owner navigates away mid-countdown —
    // never let it keep ticking (and calling setState) on an unmounted
    // component.
    return () => clearInterval(countdownIntervalRef.current);
  }, []);

  /**
   * startCountdown
   * (Re)starts the countdown clock. Takes the server's real expiresAt
   * (from either a fresh send or a "skipped, still valid" response) and
   * counts down from the ACTUAL remaining time — never blindly resets
   * to a full OTP_COUNTDOWN_SECONDS, since the automatic on-mount call
   * may have found an existing code that's already partway through its
   * life (see sendCode's forceNew: false).
   */
  function startCountdown(expiresAt) {
    clearInterval(countdownIntervalRef.current);

    const targetTime = expiresAt ? new Date(expiresAt).getTime() : Date.now() + OTP_COUNTDOWN_SECONDS * 1000;

    function tick() {
      const remaining = Math.max(0, Math.round((targetTime - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(countdownIntervalRef.current);
        setIsCodeExpired(true);
      }
    }

    setIsCodeExpired(false);
    tick();
    countdownIntervalRef.current = setInterval(tick, 1000);
  }

  /**
   * sendCode
   * Requests a code. Shared between the automatic on-mount call
   * (forceNew: false — leaves a still-valid outstanding code alone
   * instead of invalidating it) and the manual "Resend code" button
   * (forceNew: true — always issues and emails a brand-new code).
   */
  async function sendCode(forceNew = true) {
    setSendStatus({ state: "sending", message: "" });
    setAuthError(null);

    let response;
    try {
      response = await fetch("/api/admin/vault-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceNew }),
      });
    } catch {
      setSendStatus({ state: "error", message: "" });
      setAuthError("We couldn't reach the server. Check your connection and try again.");
      return;
    }

    let result;
    try {
      result = await response.json();
    } catch {
      // Response wasn't valid JSON — most likely an unhandled server
      // error page rather than our route's own JSON error response.
      setSendStatus({ state: "error", message: "" });
      setAuthError("Something went wrong on the server. Please try again.");
      return;
    }

    if (!result.success) {
      setSendStatus({ state: "error", message: "" });
      setAuthError(result.message || "Failed to send the code.");
      return;
    }

    setSendStatus({ state: "sent", message: result.message });
    startCountdown(result.data?.expiresAt);
  }

  /**
   * onSubmit
   * Posts the submitted code to PATCH /api/admin/vault-otp. The
   * comparison happens entirely server-side — this function never
   * compares the code against anything itself.
   */
  async function onSubmit(data) {
    setAuthError(null);

    let response;
    try {
      response = await fetch("/api/admin/vault-otp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      setAuthError("We couldn't reach the server. Check your connection and try again.");
      return;
    }

    let result;
    try {
      result = await response.json();
    } catch {
      setAuthError("Something went wrong on the server. Please try again.");
      return;
    }

    if (!result.success) {
      setAuthError(result.message || "Incorrect or expired code.");
      return;
    }

    // vaultSession cookie now has otpVerified: true — the recovery
    // page will pass its server-side check.
    router.push(`/system-vault/${vaultSlug}`);
    router.refresh();
  }

  return (
    <>
      <div className="vaultLoginHeader">
        <span className="vaultLoginBadge" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </span>
        <span className="vaultLoginEyebrow">Restricted Area</span>
        <h1 className="vaultLoginTitle">Verification Code</h1>
        <p className="vaultLoginLegend">
          {sendStatus.state === "sending" && "Sending a code to the vault owner's email…"}
          {sendStatus.state === "sent" && sendStatus.message}
          {sendStatus.state === "error" && "Enter the code from your email, or request a new one below."}
        </p>
        {/* Only shown once a code has actually been sent — aria-live so
            screen reader users hear the expiry warning without having
            to keep re-focusing the clock. */}
        {sendStatus.state === "sent" && (
          <p className="vaultOtpCountdown" aria-live="polite">
            {isCodeExpired ? "Code expired" : `Code expires in ${formatCountdown(secondsRemaining)}`}
          </p>
        )}
      </div>

      {authError && (
        <p role="alert" className="vaultLoginAuthError">
          {authError}
        </p>
      )}

      <form className="vaultLoginForm" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="vaultLoginField">
          <label htmlFor="code">
            {OTP_CODE_LENGTH}-character code <span aria-hidden="true">*</span>
            {/* Turns amber once there's input but it's short, green once
                it hits exactly 12 — a glance is enough to know whether
                the paste came through complete. */}
            <span
              className={`vaultOtpCounter${
                codeLength === OTP_CODE_LENGTH ? " vaultOtpCounter--complete" : codeLength > 0 ? " vaultOtpCounter--short" : ""
              }`}
              aria-hidden="true"
            >
              {codeLength}/{OTP_CODE_LENGTH}
            </span>
          </label>
          <input
            id="code"
            type="text"
            autoComplete="one-time-code"
            autoFocus
            className="vaultOtpCodeInput"
            disabled={isCodeExpired}
            name={codeField.name}
            ref={codeField.ref}
            onBlur={codeField.onBlur}
            onChange={handleCodeChange}
          />
          {errors.code && (
            <span role="alert" className="vaultLoginFieldError">
              {errors.code.message}
            </span>
          )}
        </div>

        <button type="submit" className="vaultLoginSubmitButton" disabled={isSubmitting || isCodeExpired}>
          {isSubmitting ? "Verifying…" : "Verify"}
        </button>

        <button
          type="button"
          // Once the code expires, this becomes the only viable next
          // step — sized up and given the site's accent green so it
          // reads as the primary action instead of a quiet fallback.
          className={`vaultOtpResendButton${isCodeExpired ? " vaultOtpResendButton--urgent" : ""}`}
          onClick={() => sendCode(true)}
          disabled={sendStatus.state === "sending"}
        >
          {sendStatus.state === "sending" ? "Sending…" : "Resend code"}
        </button>
      </form>
    </>
  );
}