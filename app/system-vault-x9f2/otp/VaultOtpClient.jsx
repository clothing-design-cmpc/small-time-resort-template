/**
 * FILE: app/system-vault-x9f2/otp/VaultOtpClient.jsx
 * ROLE: Standalone — not gated by proxy.js or any super_admin session;
 *       gated entirely by the (already-passphrase-verified) vaultSession
 *       cookie the two API calls below rely on.
 *
 * PURPOSE:
 * Second-factor form: fires the send-code request once on mount, then
 * lets the owner type in the 6-digit code from their email. The code
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
 * 4. Redirect to /system-vault-x9f2, which now passes its server-side
 *    check and renders the recovery dashboard
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const vaultOtpSchema = z.object({
  code: z
    .string()
    .min(1, "Enter the code from your email.")
    .regex(/^\d+$/, "The code is numbers only."),
});

export default function VaultOtpClient() {
  const router = useRouter();
  // Whole-form auth error (wrong/expired code, rate limited, network
  // failure) — separate from the single field's own Zod error.
  const [authError, setAuthError] = useState(null);
  const [sendStatus, setSendStatus] = useState({ state: "sending", message: "" });
  // Guards against React 18/19 StrictMode's double-invoke of effects in
  // development, which would otherwise fire two send requests (and two
  // emails) for a single page load.
  const hasSentOnce = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(vaultOtpSchema) });

  // Fires once when the screen loads — the owner shouldn't have to
  // click a button just to get the first code.
  useEffect(() => {
    if (hasSentOnce.current) return;
    hasSentOnce.current = true;
    sendCode();
  }, []);

  /**
   * sendCode
   * Requests a fresh code. Shared between the automatic on-mount send
   * and the manual "Resend code" button.
   */
  async function sendCode() {
    setSendStatus({ state: "sending", message: "" });
    setAuthError(null);

    let response;
    try {
      response = await fetch("/api/admin/vault-otp", { method: "POST" });
    } catch {
      setSendStatus({ state: "error", message: "" });
      setAuthError("We couldn't reach the server. Check your connection and try again.");
      return;
    }

    const result = await response.json();

    if (!result.success) {
      setSendStatus({ state: "error", message: "" });
      setAuthError(result.message || "Failed to send the code.");
      return;
    }

    setSendStatus({ state: "sent", message: result.message });
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

    const result = await response.json();

    if (!result.success) {
      setAuthError(result.message || "Incorrect or expired code.");
      return;
    }

    // vaultSession cookie now has otpVerified: true — the recovery
    // page will pass its server-side check.
    router.push("/system-vault-x9f2");
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
      </div>

      {authError && (
        <p role="alert" className="vaultLoginAuthError">
          {authError}
        </p>
      )}

      <form className="vaultLoginForm" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="vaultLoginField">
          <label htmlFor="code">
            6-digit code <span aria-hidden="true">*</span>
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            className="vaultOtpCodeInput"
            {...register("code")}
          />
          {errors.code && (
            <span role="alert" className="vaultLoginFieldError">
              {errors.code.message}
            </span>
          )}
        </div>

        <button type="submit" className="vaultLoginSubmitButton" disabled={isSubmitting}>
          {isSubmitting ? "Verifying…" : "Verify"}
        </button>

        <button
          type="button"
          className="vaultOtpResendButton"
          onClick={sendCode}
          disabled={sendStatus.state === "sending"}
        >
          {sendStatus.state === "sending" ? "Sending…" : "Resend code"}
        </button>
      </form>
    </>
  );
}
