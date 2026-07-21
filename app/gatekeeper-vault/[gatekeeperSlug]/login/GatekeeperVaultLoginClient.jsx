/**
 * FILE: app/gatekeeper-vault/[gatekeeperSlug]/login/GatekeeperVaultLoginClient.jsx
 * ROLE: Standalone — not gated by proxy.js or any super_admin session;
 *       gated entirely by the passphrase this form submits.
 *
 * PURPOSE:
 * Single-field passphrase form for the Gatekeeper Vault's login.
 * Deliberately minimal, same reasoning as the disaster-recovery
 * vault's own login screen — this isn't meant to be visited casually.
 *
 * DATA FLOW:
 * 1. Whoever knows the passphrase types it and submits
 * 2. POST /api/gatekeeper-vault/login verifies it and, on match, sets
 *    the HttpOnly "gatekeeperVaultSession" cookie
 * 3. On success, redirect back to this same slug's root — the tester
 *    UI renders there once the session cookie is present
 * 4. On failure, show the same generic error every time
 */
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const gatekeeperVaultLoginSchema = z.object({
  passphrase: z.string().min(1, "Enter the passphrase."),
});

export default function GatekeeperVaultLoginClient() {
  const router = useRouter();
  // The current URL's own slug — never hardcoded, since it changes on
  // every passphrase rotation.
  const { gatekeeperSlug } = useParams();
  const [isPassphraseVisible, setIsPassphraseVisible] = useState(false);
  const [authError, setAuthError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(gatekeeperVaultLoginSchema) });

  async function onSubmit(data) {
    setAuthError(null);

    let response;
    try {
      response = await fetch("/api/gatekeeper-vault/login", {
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

    router.push(`/gatekeeper-vault/${gatekeeperSlug}`);
    router.refresh();
  }

  return (
    <>
      <div className="gatekeeperVaultLoginHeader">
        <span className="gatekeeperVaultLoginBadge" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            <path d="M12 15v2" />
          </svg>
        </span>
        <span className="gatekeeperVaultLoginEyebrow">Restricted Area</span>
        <h1 className="gatekeeperVaultLoginTitle">Vault Passphrase</h1>
        <p className="gatekeeperVaultLoginLegend">
          This area has its own separate login — enter the passphrase to continue.
        </p>
      </div>

      {authError && (
        <p role="alert" className="gatekeeperVaultLoginAuthError">
          {authError}
        </p>
      )}

      <form className="gatekeeperVaultLoginForm" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="gatekeeperVaultLoginField">
          <label htmlFor="passphrase">
            Passphrase <span aria-hidden="true">*</span>
          </label>
          <div className="gatekeeperVaultLoginPassphraseWrapper">
            <input
              id="passphrase"
              type={isPassphraseVisible ? "text" : "password"}
              autoFocus
              autoComplete="off"
              {...register("passphrase")}
            />
            <button
              type="button"
              className="gatekeeperVaultLoginPassphraseToggle"
              onClick={() => setIsPassphraseVisible((visible) => !visible)}
              aria-label={isPassphraseVisible ? "Hide passphrase" : "Show passphrase"}
            >
              {isPassphraseVisible ? "Hide" : "Show"}
            </button>
          </div>
          {errors.passphrase && (
            <span role="alert" className="gatekeeperVaultLoginFieldError">
              {errors.passphrase.message}
            </span>
          )}
        </div>

        <button type="submit" className="gatekeeperVaultLoginSubmitButton" disabled={isSubmitting}>
          {isSubmitting ? "Verifying…" : "Unlock"}
        </button>
      </form>
    </>
  );
}
