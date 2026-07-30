/**
 * FILE: app/system-setup-wizard/VerifyVaultAccessStep.jsx
 * ROLE: Client Component — Step 8 of the setup wizard
 *
 * PURPOSE:
 * Renders once VaultPassphraseStep's generate call succeeds (Step 7).
 * By the time this component ever mounts, isSetupWizardLocked() is
 * ALREADY true (see generate-passphrase/route.js's SELF-LOCK NOTE) —
 * every route under app/api/system-setup-wizard/ would now 404,
 * including this step's own parent if it tried to call one again.
 * So this step makes NO server calls at all: vaultUrl was computed
 * server-side back in Step 7’s response (services/vaultAuth.js's
 * getVaultRecoveryUrl()) and is simply passed down as a prop — this
 * is the only way Step 8 can ever have a working link.
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
 * 1. Person clicks the vaultUrl link (opens in a new tab) and signs
 *    in there using the passphrase they just copied in Step 7, then
 *    the emailed OTP (services/vaultOtp.js) — the real vault system's
 *    own existing login flow, untouched by anything in this wizard
 * 2. Back in this tab, clicking "I've verified vault access" is a
 *    purely client-side state change — hands off to
 *    <PreHandoffTestingStep /> (Step 9 — full-site QA checklist,
 *    added so login/vault access being individually verified doesn't
 *    get mistaken for "the whole site was tested"). Nothing is sent
 *    to the server; setup_completed was already logged back in
 *    Step 7’s route.
 */
"use client";

import { useState } from "react";
import PreHandoffTestingStep from "./PreHandoffTestingStep";

export default function VerifyVaultAccessStep({ vaultUrl }) {
  const [verified, setVerified] = useState(false);

  if (verified) {
    return <PreHandoffTestingStep />;
  }

  return (
    <div className="setupWizardCard">
      <span className="setupWizardEyebrow">Step 8 of 10</span>
      <h1 className="setupWizardTitle">Verify vault access</h1>
      <p className="setupWizardBody">
        Open the vault recovery page in a new tab and sign in using the passphrase you just
        copied, then the one-time code emailed to you next. This confirms the services
        configured earlier (Supabase, EmailJS) actually work — not just that they were
        present in the checklist.
      </p>

      {vaultUrl ? (
        <div className="setupWizardCommandRow">
          <code className="setupWizardCodeBlock">{vaultUrl}</code>
        </div>
      ) : (
        <p className="setupWizardError">
          The vault link couldn't be computed. Check your email or the R2 backup from Step 7
          for the passphrase, then open the vault from the resort's live site directly.
        </p>
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
