/**
 * FILE: app/system-vault/[vaultSlug]/login/VaultLoginClient.jsx
 * ROLE: Standalone — not gated by proxy.js or any super_admin session;
 *       gated entirely by the passphrase this form submits
 *
 * PURPOSE:
 * Single-field passphrase form for the vault's own first-factor login.
 * Deliberately minimal — no "remember me", no demo quick-fill button —
 * this is a disaster-recovery gate, not a page meant to be visited
 * casually.
 *
 * DATA FLOW:
 * 1. Whoever knows the vault passphrase types it and submits
 * 2. POST /api/admin/vault-login verifies it against the current
 *    passphrase hash (services/vaultAuth.js) and, on match, sets
 *    the HttpOnly "vaultSession" cookie with otpVerified: false
 * 3. On success, redirect to this same slug's /otp step — the second
 *    factor (services/vaultOtp.js's emailed code) still needs to be
 *    completed before this slug's root will render
 * 4. On failure, show the same generic error every time (never reveal
 *    which part of the check failed)
 */
"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import VaultIdleTimeoutNotice from "./VaultIdleTimeoutNotice";

const vaultLoginSchema = z.object({
  // Pasting from the rotation email ("NEW PASSPHRASE: <value>") can drag
  // in a leading/trailing space — trim before the min-length check so a
  // correctly-copied passphrase never fails purely because of that, and
  // so the server-side hash comparison (which also trims — see
  // app/api/admin/vault-login/route.js) is comparing the same value the
  // owner actually intended to type.
  passphrase: z.preprocess(
    (val) => (typeof val === "string" ? val.trim() : val),
    z.string().min(1, "Enter the vault passphrase.")
  ),
});

export default function VaultLoginClient() {
  const router = useRouter();
  // The current URL's own slug — never hardcoded, since it changes on
  // every passphrase rotation (services/vaultAuth.js's computeVaultUrlSlug).
  const { vaultSlug } = useParams();
  const [isPassphraseVisible, setIsPassphraseVisible] = useState(false);
  // Whole-form auth error (wrong passphrase, rate limited, network
  // failure) — separate from the single field's own Zod error.
  const [authError, setAuthError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(vaultLoginSchema) });

  /**
   * onSubmit
   * Posts the passphrase to /api/admin/vault-login. That route checks
   * the existing super_admin session first, then the passphrase itself,
   * and only sets "vaultSession" once both are satisfied.
   */
  async function onSubmit(data) {
    setAuthError(null);

    let response;
    try {
      response = await fetch("/api/admin/vault-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      setAuthError("We couldn't reach the server. Check your connection and try again.");
      return;
    }

    const result = await response.json();

    if (!result.success) {
      // Rate limit exceeded -> the API route has already blocked this IP
      // (services/ipBlock.js). Reload the page instead of just showing
      // the error: proxy.js's vault-slug guess guard checks isIpBlocked()
      // on every request under /system-vault/ and immediately redirects
      // an already-blocked IP to /access-denied before this page (or any
      // slug check) even runs.
      if (result.blocked) {
        window.location.reload();
        return;
      }
      setAuthError(result.message || "Incorrect passphrase.");
      return;
    }

    // vaultSession cookie is set, but only with otpVerified: false —
    // the recovery page's server-side check now sends any visit to
    // this slug's root straight to its /otp step until that second
    // factor is completed too.
    router.push(`/system-vault/${vaultSlug}/otp`);
    router.refresh();
  }

  return (
    <>
      <div className="vaultLoginHeader">
        <span className="vaultLoginBadge" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            <path d="M12 15v2" />
          </svg>
        </span>
        <span className="vaultLoginEyebrow">Restricted Area</span>
        <h1 className="vaultLoginTitle">Vault Passphrase</h1>
        <p className="vaultLoginLegend">
          This area has its own separate login — enter the vault passphrase to continue.
        </p>
      </div>

      {/* Wrapped in Suspense because useSearchParams() requires it. */}
      <Suspense fallback={null}>
        <VaultIdleTimeoutNotice />
      </Suspense>

      {authError && (
        <p role="alert" className="vaultLoginAuthError">
          {authError}
        </p>
      )}

      <form className="vaultLoginForm" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="vaultLoginField">
          <label htmlFor="passphrase">
            Passphrase <span aria-hidden="true">*</span>
          </label>
          <div className="vaultLoginPassphraseWrapper">
            <input
              id="passphrase"
              type={isPassphraseVisible ? "text" : "password"}
              autoFocus
              autoComplete="off"
              {...register("passphrase")}
            />
            <button
              type="button"
              className="vaultLoginPassphraseToggle"
              onClick={() => setIsPassphraseVisible((visible) => !visible)}
              aria-label={isPassphraseVisible ? "Hide passphrase" : "Show passphrase"}
            >
              {isPassphraseVisible ? "Hide" : "Show"}
            </button>
          </div>
          {errors.passphrase && (
            <span role="alert" className="vaultLoginFieldError">
              {errors.passphrase.message}
            </span>
          )}
        </div>

        <button type="submit" className="vaultLoginSubmitButton" disabled={isSubmitting}>
          {isSubmitting ? "Verifying…" : "Unlock"}
        </button>
      </form>
    </>
  );
}
