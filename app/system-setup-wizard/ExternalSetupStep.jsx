/**
 * FILE: app/system-setup-wizard/ExternalSetupStep.jsx
 * ROLE: Client Component — Step 6 of the setup wizard
 *
 * PURPOSE:
 * Renders once ScriptsHealthStep's "Continue" is clicked (Step 5).
 * Like before, this step has NO API route behind it and makes NO
 * server calls at all — everything here happens on the developer's
 * own machine, in their own terminal.
 *
 * MERGED WITH THE OLD STEP 7 (2026 update, on request):
 * This step used to cover only the OwnerVault/TOTP script, with a
 * separate Step 7 (VaultPassphraseStep, now removed from the wizard)
 * handling the vault passphrase via a web-based auto-generate API
 * call. Both vault setups are terminal-only scripts now, so they are
 * shown together here as one step instead of two:
 *
 *   1. node scripts/setupVault.js "<passphrase>"
 *      OwnerVault + TOTP QR code generation. This is the ONLY place
 *      the TOTP secret is ever generated in plaintext — scripts/
 *      setupVault.js's own header says it must never be deployed as
 *      an API route. Instructions include the "scan the QR then
 *      delete vault-totp-qr.png" warning.
 *
 *   2. node scripts/hashVaultPassphrase.js "<passphrase>"
 *      Hashes a chosen vault passphrase and prints the
 *      VAULT_PASSPHRASE_HASH line to paste into .env.local — the
 *      same script referenced on the real vault-setup page
 *      (ScriptsReferenceSection.jsx) and in docs/SETUP_NOTES.md.
 *      Deliberately NOT the old web auto-generate flow: that flow
 *      wrote straight to the DB and doubled as the "complete setup"
 *      trigger, which mixed two unrelated concerns (setting a
 *      passphrase vs. finalizing the wizard). services/
 *      setupWizardStatus.js's arePrerequisitesMet() now accepts
 *      this env-set value exactly like it accepts the DB row, so
 *      this path finalizes the wizard the same as before.
 *
 *   3. MaxMind GeoLite2-City.mmdb
 *      Not an env var — a physical file. Manual download from
 *      maxmind.com, placed at services/geoip/GeoLite2-City.mmdb
 *      (path configured via MAXMIND_DB_PATH — Step 4's geoip group
 *      already checks that env var's presence; this step is only
 *      about the physical file itself).
 *
 * Continue hands off directly to <VerifyVaultAccessStep /> (Step 7)
 * — that step now fetches its own vaultUrl on mount (GET
 * /api/system-setup-wizard/vault-status) instead of receiving it as
 * a prop from the old auto-generate response.
 */
"use client";

import { useState } from "react";
import { useToast } from "./shared/useToast";
import ToastStack from "./shared/ToastStack";
import VerifyVaultAccessStep from "./VerifyVaultAccessStep";

const EXTERNAL_STEPS = [
  {
    title: "1. Owner vault + TOTP QR code",
    command: "node scripts/setupVault.js",
    description:
      "Auto-generates a random passphrase, prints it once (save it immediately), creates the OwnerVault row, and writes vault-totp-qr.png to the project root. Scan it with your authenticator app immediately, then delete the file — never commit it or leave it on disk. Refuses to run if a vault already exists. Pass your own passphrase as an argument instead if you'd rather choose one.",
    warning: "This is the only place the TOTP secret is ever generated in plaintext. Never deployed as an API route.",
  },
  {
    title: "2. Vault passphrase (hidden recovery page)",
    command: 'node scripts/hashVaultPassphrase.js "your-chosen-passphrase"',
    description:
      "Hashes your chosen passphrase and prints a VAULT_PASSPHRASE_HASH line — copy it into .env.local, then restart the dev server so it's picked up. This is the passphrase for the separate hidden recovery page (/system-vault/[slug]), not the owner vault dashboard above. Passphrase must be at least 12 characters.",
    warning: "Never commit the plaintext passphrase anywhere, including this terminal's shell history if the machine is shared.",
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
    return <VerifyVaultAccessStep />;
  }

  return (
    <div className="setupWizardStepGroup">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="setupWizardCard">
        <span className="setupWizardEyebrow">Step 6 of 10</span>
        <h1 className="setupWizardTitle">Owner vault + vault passphrase setup</h1>
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
          Not an env var — a physical file. Already included in this
          template at <code>services/geoip/GeoLite2-City.mmdb</code>, and{" "}
          <code>MAXMIND_DB_PATH</code> already defaults to that path — no
          setup required to get started. It&apos;s one worldwide
          IP-to-location file, not tied to any single client, so the same
          copy is reused across every client project you deploy this to.
          Still worth refreshing periodically: register a free account at{" "}
          <code>maxmind.com</code>, download <code>GeoLite2-City.mmdb</code>
          , and replace the file at that same path — MaxMind updates
          GeoLite2 roughly every 2 weeks, so the committed copy only gets
          staler the longer it sits.
        </p>
      </div>

      <div className="setupWizardCard">
        <p className="setupWizardBody">
          You can come back and finish these later — Step 7
          doesn&apos;t require any of the above to be done first.
        </p>
        <button type="button" className="setupWizardButton" onClick={() => setContinued(true)}>
          Continue
        </button>
      </div>
    </div>
  );
}
