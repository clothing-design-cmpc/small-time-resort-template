/**
 * FILE: app/system-vault-x9f2/login/VaultLoginClient.jsx
 * ROLE: Super-admin only — protected by proxy.js, gated further by the
 *       passphrase this form submits
 *
 * PURPOSE:
 * Single-field passphrase form for the vault's second-factor login.
 * Deliberately minimal — no email field, no "remember me", no demo
 * quick-fill button — this is a disaster-recovery gate, not a page
 * meant to be visited casually.
 *
 * DATA FLOW:
 * 1. Super-admin types the vault passphrase and submits
 * 2. POST /api/admin/vault-login verifies it against
 *    VAULT_PASSPHRASE_HASH (services/vaultAuth.js) and, on match, sets
 *    the HttpOnly "vaultSession" cookie
 * 3. On success, redirect to /system-vault-x9f2 — the recovery page
 *    now passes its server-side vault-session check and renders
 * 4. On failure, show the same generic error every time (never reveal
 *    whether the super-admin session itself was somehow the problem)
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const vaultLoginSchema = z.object({
  passphrase: z.string().min(1, "Enter the vault passphrase."),
});

export default function VaultLoginClient() {
  const router = useRouter();
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
      setAuthError(result.message || "Incorrect passphrase.");
      return;
    }

    // vaultSession cookie is set — the recovery page will now pass its
    // server-side check.
    router.push("/system-vault-x9f2");
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
          Your admin session isn&apos;t enough on its own — this area needs its own passphrase.
        </p>
      </div>

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
