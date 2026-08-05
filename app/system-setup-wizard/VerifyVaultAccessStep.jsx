/**
 * FILE: app/system-setup-wizard/VerifyVaultAccessStep.jsx
 * ROLE: Client Component — Step 7 of the setup wizard
 *
 * PURPOSE:
 * Renders once ExternalSetupStep's "Continue" is clicked (Step 6).
 *
 * SELF-FETCHING (2026 update, on request):
 * Previously this received vaultUrl as a prop, computed server-side
 * by the old Step 7's web auto-generate call. Step 6 is now two
 * terminal-only scripts with no server call at all (see
 * ExternalSetupStep.jsx's header), so there is nothing to pass down
 * — this step fetches its own vaultUrl on mount instead, via GET
 * /api/system-setup-wizard/vault-status (strictly read-only, never
 * generates anything).
 *
 * PURPOSE OF THE STEP ITSELF:
 * A plain reminder + link so whoever is running setup actually opens
 * the vault recovery page once, in a fresh tab, and confirms the
 * external services configured back in Steps 2/5 (Supabase, EmailJS
 * for the OTP step, etc.) genuinely work end-to-end — not just that
 * envcheck reported them as "present." Presence in .env.local doesn't
 * guarantee a key is valid; only an actual login attempt does.
 *
 * DATA FLOW:
 * 1. On mount, GET /api/system-setup-wizard/vault-status -> vaultUrl
 *    (null if scripts/setupVaultPassphrase.js hasn't been run yet —
 *    shows a "come back once you've run Step 6" message instead)
 * 2. Person clicks the vaultUrl link (opens in a new tab) and signs
 *    in there using the passphrase they set in Step 6, then the
 *    emailed OTP (services/vaultOtp.js) — the real vault system's
 *    own existing login flow, untouched by anything in this wizard
 * 3. Back in this tab, clicking "I've verified vault access" is a
 *    purely client-side state change — hands off to
 *    <LocalDryRunStep /> (Step 8 — a manual click-through QA pass
 *    against localhost, added so problems surface before deploying
 *    instead of after).
 */
"use client";

import { useState, useEffect } from "react";
import LocalDryRunStep from "./LocalDryRunStep";

export default function VerifyVaultAccessStep() {
  const [verified, setVerified] = useState(false);
  const [vaultUrl, setVaultUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Runs once on mount — this step has no other trigger for fetching
  // the vault URL, since Step 6 no longer hands anything down as a prop.
  useEffect(() => {
    let isMounted = true;

    async function fetchVaultStatus() {
      try {
        const response = await fetch("/api/system-setup-wizard/vault-status");
        const apiResult = await response.json();
        if (!isMounted) return;

        if (!response.ok || !apiResult.success) {
          setLoadError(apiResult.message ?? "We couldn't check the vault status.");
          return;
        }
        setVaultUrl(apiResult.data.vaultUrl);
      } catch {
        if (isMounted) setLoadError("We couldn't reach the server. Check your connection and try again.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchVaultStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  if (verified) {
    return <LocalDryRunStep />;
  }

  return (
    <div className="setupWizardCard">
      <span className="setupWizardEyebrow">Step 7 of 11</span>
      <h1 className="setupWizardTitle">Verify vault access</h1>
      <p className="setupWizardBody">
        Open the vault recovery page in a new tab and sign in using the passphrase you set in
        Step 6, then the one-time code emailed to you next. This confirms the services
        configured earlier (Supabase, EmailJS) actually work — not just that they were
        present in the checklist.
      </p>

      {isLoading && <p className="setupWizardBody">Checking vault status…</p>}
      {loadError && <p className="setupWizardError">{loadError}</p>}

      {!isLoading && !loadError && !vaultUrl && (
        <p className="setupWizardError">
          No vault passphrase found yet. Run{" "}
          <code>node scripts/setupVaultPassphrase.js</code> from Step 6, then refresh this page.
        </p>
      )}

      {vaultUrl && (
        <div className="setupWizardCommandRow">
          <code className="setupWizardCodeBlock">{vaultUrl}</code>
        </div>
      )}

      {vaultUrl && (
        <a
          href={vaultUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="setupWizardButtonSecondary"
        >
          Open Vault in New Tab
        </a>
      )}

      <button type="button" className="setupWizardButton" onClick={() => setVerified(true)}>
        I've Verified Vault Access
      </button>
    </div>
  );
}
