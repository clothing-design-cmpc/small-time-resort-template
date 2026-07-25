/**
 * FILE: app/system-setup-wizard/ExternalSetupStep.jsx
 * ROLE: Client Component — Step 7 of the setup wizard
 *
 * PURPOSE:
 * Renders once ScriptsHealthStep's "Continue" is clicked (Step 6).
 * Unlike every prior step, this one has NO API route behind it and
 * makes NO server calls at all — it's pure reference instructions for
 * three things that must run on the developer's own machine and are
 * never wired into any web UI (plan doc's "TWO SEPARATE VAULT
 * SYSTEMS" and "READ-ONLY VS TERMINAL-ONLY SCRIPTS" sections):
 *
 *   1. node scripts/setupVault.js "<passphrase>"
 *      OwnerVault + TOTP QR code generation. This is the ONLY place
 *      the TOTP secret is ever generated in plaintext — scripts/
 *      setupVault.js's own header says it must never be deployed as
 *      an API route. Instructions include the "scan the QR then
 *      delete vault-totp-qr.png" warning.
 *
 *   2. node scripts/getGoogleDriveRefreshToken.mjs
 *      Interactive OAuth flow with a localhost redirect — must run on
 *      the developer's own machine, never as a deployed route.
 *
 *   3. MaxMind GeoLite2-City.mmdb
 *      Not an env var — a physical file. Manual download from
 *      maxmind.com, placed at services/geoip/GeoLite2-City.mmdb
 *      (path configured via MAXMIND_DB_PATH — Step 5's geoip group
 *      already checks that env var's presence; this step is only
 *      about the physical file itself).
 *
 * Step 8 (Generate Vault Passphrase) is built as its own component —
 * the Continue button here hands off to <VaultPassphraseStep />, same
 * hand-off pattern every prior step uses.
 */
"use client";

import { useState } from "react";
import { useToast } from "./shared/useToast";
import ToastStack from "./shared/ToastStack";
import VaultPassphraseStep from "./VaultPassphraseStep";

const EXTERNAL_STEPS = [
  {
    title: "1. Owner vault + TOTP QR code",
    command: 'node scripts/setupVault.js "your-chosen-passphrase-min-12-chars"',
    description:
      "Creates the OwnerVault row and writes vault-totp-qr.png to the project root. Scan it with your authenticator app immediately, then delete the file — never commit it or leave it on disk. Refuses to run if a vault already exists.",
    warning: "This is the only place the TOTP secret is ever generated in plaintext. Never deployed as an API route.",
  },
  {
    title: "2. Google Drive refresh token",
    command: "node scripts/getGoogleDriveRefreshToken.mjs",
    description:
      'Walks you through Google\'s OAuth consent screen as the Gmail account that should own backup uploads, then prints a refresh token. Paste it into GOOGLE_OAUTH_REFRESH_TOKEN in .env.local and your deployment\'s env vars. Requires GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET already set (OAuth client type "Desktop app", Google Drive API enabled).',
    warning: "Interactive, localhost-redirect OAuth flow — must run on your own machine, never in GitHub Actions or as a deployed route.",
  },
];

export default function ExternalSetupStep() {
  const { toasts, showToast, dismissToast } = useToast();
  const [continued, setContinued] = useState(false);

  async function handleCopy(command) {
    try {
      await navigator.clipboard.writeText(command);
      showToast("✓ Command copied.", "success");
    } catch {
      showToast("✕ Couldn't copy automatically — please copy it manually.", "error");
    }
  }

  if (continued) {
    return <VaultPassphraseStep />;
  }

  return (
    <div className="setupWizardStepGroup">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="setupWizardCard">
        <span className="setupWizardEyebrow">Step 7 of 10</span>
        <h1 className="setupWizardTitle">External / local-machine-only setup</h1>
        <p className="setupWizardBody">
          Nothing on this step runs from this page — these three
          things happen on your own machine, not through the wizard.
          Copy the commands below and run them in your own terminal.
        </p>
      </div>

      {EXTERNAL_STEPS.map((item) => (
        <div key={item.command} className="setupWizardCard">
          <h2 className="setupWizardSubStepTitle">{item.title}</h2>
          <div className="setupWizardCommandRow">
            <code className="setupWizardCodeBlock">{item.command}</code>
            <button type="button" className="setupWizardCopyButton" onClick={() => handleCopy(item.command)}>
              Copy
            </button>
          </div>
          <p className="setupWizardBody">{item.description}</p>
          <p className="setupWizardError">{item.warning}</p>
        </div>
      ))}

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">3. MaxMind GeoIP database file</h2>
        <p className="setupWizardBody">
          Not an env var — a physical file. Register a free account at{" "}
          <code>maxmind.com</code>, download <code>GeoLite2-City.mmdb</code>
          , and place it at <code>services/geoip/GeoLite2-City.mmdb</code>.
          Intentionally not committed to git — re-download it on every
          environment/deployment that needs geolocation lookups.
          <code>MAXMIND_DB_PATH</code> just points at wherever you put it;
          the default already matches this location.
        </p>
      </div>

      <div className="setupWizardCard">
        <p className="setupWizardBody">
          You can come back and finish these later — Step 8
          doesn&apos;t require any of the above to be done first.
        </p>
        <button type="button" className="setupWizardButton" onClick={() => setContinued(true)}>
          Continue
        </button>
      </div>
    </div>
  );
}
