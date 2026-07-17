/**
 * FILE: app/vault-x9k2/page.jsx
 * ROLE: Owner only — secret vault entry point
 *
 * PURPOSE:
 * First checkpoint of the vault system. Owner enters the vault
 * passphrase and current TOTP code together. On success, redirects to
 * the vault dashboard.
 *
 * IMPORTANT: "vault-x9k2" is a placeholder folder name. Rename this
 * entire folder to your own unguessable slug before deploying — never
 * ship it with an obvious name like "vault" or "admin-recovery".
 *
 * DATA FLOW:
 * 1. Owner submits passphrase + TOTP code
 * 2. POST /api/vault/login verifies both together
 * 3. On success, an HttpOnly vault session cookie is set and the owner
 *    is redirected to the vault dashboard
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "./vault.css";

export default function VaultLoginPage() {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * handleSubmit
   * Sends passphrase + TOTP together to the vault login route. Shows a
   * single generic error on failure — never reveals which factor was wrong.
   */
  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/vault/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase, totpCode }),
      });
      const result = await response.json();

      if (result.success) {
        router.push("/vault-x9k2/dashboard");
      } else {
        setErrorMessage(result.message || "Invalid passphrase or code.");
      }
    } catch {
      setErrorMessage("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="vaultLoginSection">
      <div className="vaultLoginContainer">
        <article className="vaultLoginCard">
          <span className="vaultEyebrow">Owner Vault</span>
          <h1 className="vaultTitle">Vault Access</h1>
          <p className="vaultSubtitle">Enter your passphrase and current authenticator code.</p>

          <form onSubmit={handleSubmit} className="vaultForm">
            <label htmlFor="passphrase">Passphrase</label>
            <input
              id="passphrase"
              type="password"
              autoFocus
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              required
            />

            <label htmlFor="totpCode">Authenticator Code</label>
            <input
              id="totpCode"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={totpCode}
              onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))}
              required
            />

            {errorMessage && (
              <span className="vaultError" role="alert">{errorMessage}</span>
            )}

            <button type="submit" disabled={isSubmitting} className="vaultSubmitButton">
              {isSubmitting ? "Verifying…" : "Unlock Vault"}
            </button>
          </form>
        </article>
      </div>
    </section>
  );
}
