/**
 * FILE: app/system-setup-wizard/ExternalSetupStep.jsx
 * ROLE: Client Component — Step 6 of the setup wizard
 *
 * PURPOSE:
 * Renders once ScriptsHealthStep's "Continue" is clicked (Step 5).
 * This step has NO API route behind it and makes NO server calls at
 * all — everything here happens on the developer's own machine, in
 * their own terminal.
 *
 * OWNER VAULT (TOTP) SYSTEM REMOVED (2026 cleanup):
 * This step used to also cover a second, separate "Owner Vault" TOTP
 * system (scripts/setupVault.js, services/totp.js, the OwnerVault and
 * VaultSession Prisma models, and the /api/vault/login, /api/vault/unban,
 * /api/vault/banned-devices routes). That system was schema/backend/script
 * only — no frontend page ever consumed its API routes (confirmed: no
 * component anywhere fetched /api/vault/login), so it sat unused since
 * the commit that introduced it. Removed entirely rather than left as
 * dead code. The one remaining vault system below (VaultPassphrase,
 * gating the real hidden recovery page at /system-vault/[slug]) is
 * unaffected — it was always a separate, independent system from the
 * removed one (see prisma/schema.prisma's Vault/VaultPassphrase models).
 *
 *   1. node scripts/generateEnvSecret.mjs VAULT_SETUP_KEY
 *      Generates VAULT_SETUP_KEY — an env-only master secret that
 *      grants access to the /system-vault-setup bootstrap page.
 *      Completely separate from the passphrase in item 2 below: this
 *      one lives only in .env.local (never the database), never
 *      expires, and never auto-rotates.
 *
 *   2. node scripts/setupVaultPassphrase.js
 *      Auto-generates a random vault passphrase, saves it to the
 *      database, emails the plaintext to VAULT_OWNER_EMAIL, and backs
 *      up a copy to Cloudflare R2 — same rotate + email + R2-backup
 *      flow every other passphrase trigger uses (services/
 *      vaultPassphrase.js), just triggered from the terminal instead
 *      of a web route. Refuses to run if a passphrase already exists.
 *      For manually choosing your own passphrase instead of an
 *      auto-generated one, see scripts/hashVaultPassphrase.js
 *      (a separate manual utility, not used by this wizard step —
 *      referenced instead from the real vault dashboard's Scripts
 *      Reference section).
 *
 *   3. MaxMind GeoLite2-City.mmdb
 *      Not an env var — a physical file. Manual download from
 *      maxmind.com, placed at services/geoip/GeoLite2-City.mmdb
 *      (path configured via MAXMIND_DB_PATH — Step 4's geoip group
 *      already checks that env var's presence; this step is only
 *      about the physical file itself).
 *
 * Continue hands off directly to <VerifyVaultAccessStep /> (Step 7)
 * — that step fetches its own vaultUrl on mount (GET
 * /api/system-setup-wizard/vault-status).
 */
"use client";

import { useState } from "react";
import { useToast } from "./shared/useToast";
import ToastStack from "./shared/ToastStack";
import VerifyVaultAccessStep from "./VerifyVaultAccessStep";

const EXTERNAL_STEPS = [
  {
    title: "1. System vault setup (access key)",
    command: "node scripts/generateEnvSecret.mjs VAULT_SETUP_KEY",
    description:
      "Generates VAULT_SETUP_KEY — an env-only secret that grants access to the hidden /system-vault-setup bootstrap page. Completely separate from the recovery passphrase in item 2 below: this key lives only in .env.local, never the database. Paste the printed value into VAULT_SETUP_KEY in .env.local, then restart the dev server (Node only reads .env.local once at startup). To verify it worked, visit /system-vault-setup?key=YOUR_VAULT_SETUP_KEY in your browser — it should load the page instead of a 404.",
    warning: "This key never expires and never auto-rotates — treat it like a master password. It survives even a full database wipe, since it lives only in .env.local, never in the database.",
  },
  {
    title: "2. Vault recovery (passphrase)",
    command: "node scripts/setupVaultPassphrase.js",
    description:
      "Auto-generates a random passphrase, saves it to the database, emails the plaintext to VAULT_OWNER_EMAIL, and backs up a copy to Cloudflare R2. This is the actual recovery passphrase used to log into the hidden recovery page (/system-vault/[slug]) — a completely different value from VAULT_SETUP_KEY in item 1 above. Refuses to run if a passphrase already exists — use node scripts/rotateVaultPassphrase.mjs instead if you need to rotate it later.",
    warning: "The plaintext passphrase is shown here once only — copy it now, or find it later via the email or R2 backup.",
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
        <span className="setupWizardEyebrow">Step 6 of 11</span>
        <h1 className="setupWizardTitle">Vault setup</h1>
        <p className="setupWizardBody">
          Nothing on this step runs from this page — these three things
          happen on your own machine, not through the wizard. Copy the
          commands below and run them in your own terminal.
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