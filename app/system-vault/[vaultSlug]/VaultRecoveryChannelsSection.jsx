/**
 * FILE: app/system-vault/[vaultSlug]/VaultRecoveryChannelsSection.jsx
 * ROLE: Standalone — rendered inside RecoveryClient.jsx only
 *
 * PURPOSE:
 * Health-checks the vault's own recovery infrastructure — GitHub
 * Actions (backup/restore workflows), Google Drive (offsite
 * passphrase/backup storage), EmailJS (passphrase-rotation and OTP
 * delivery), and the optional secondary alert webhook — without
 * triggering a real backup, workflow dispatch, or EmailJS send. This
 * used to live on the super-admin dashboard (Settings > Vault
 * Passphrase), but that page accepted a regular admin session as a
 * valid credential — meaning whoever holds the client's daily-use
 * admin login could see which backend tokens were alive or dead. This
 * version lives inside the vault instead, gated purely by
 * requireVaultSession (passphrase + OTP), which the client's regular
 * admin account can never satisfy on its own.
 *
 * DATA FLOW:
 * 1. Never fetched on mount — only runs when the vault-session admin
 *    explicitly clicks "Run Test" (same read-only-until-clicked
 *    pattern the old super-admin version used)
 * 2. POST /api/admin/vault-recovery-channels — vault-session only (see
 *    that route's header comment)
 * 3. A 401 means the vault session expired mid-visit — same redirect
 *    every other call in this recovery flow already falls back to
 * 4. The optional secondary webhook channel renders as a neutral
 *    "skipped" row (not a failure) when VAULT_ALERT_WEBHOOK_URL isn't
 *    set, and doesn't count against the pass/total summary — see
 *    services/recoveryChannelTester.js
 *
 * TOASTS: showToast is passed down as a prop, same pattern
 * VaultDangerZoneSection.jsx already uses for its own actions.
 */
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import "./VaultRecoveryChannelsSection.css";

export default function VaultRecoveryChannelsSection({ showToast }) {
  const router = useRouter();
  const { vaultSlug } = useParams();

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  /**
   * handleTestRecoveryChannels
   * Runs the four-channel dry-run health check and stores the result
   * for the rows below to render. A 401 means the vault session
   * expired mid-visit, so it's sent back to this slug's login screen,
   * same as every other gated call on this page.
   */
  async function handleTestRecoveryChannels() {
    setIsTesting(true);
    try {
      const response = await axios.post("/api/admin/vault-recovery-channels");
      setTestResult(response.data.data);
      showToast(`✓ ${response.data.message}`, response.data.data.allPassed ? "success" : "warning");
    } catch (error) {
      if (error.response?.status === 401) {
        router.push(`/system-vault/${vaultSlug}/login`);
        return;
      }
      showToast("✕ Couldn't run the recovery channel tests.", "error");
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <section className="vaultRecoveryChannelsSection">
      <div className="vaultRecoveryChannelsHeader">
        <h2 className="vaultRecoveryChannelsTitle">Test Recovery Channels</h2>
        <p className="vaultRecoveryChannelsSubtitle">
          Confirms GitHub Actions, Google Drive, and EmailJS are all reachable — without
          rotating the passphrase, running a backup, or sending a real email. The secondary
          alert webhook is optional: if it isn't set up, it shows as "Optional — not set up"
          rather than a failure, and doesn't count against the summary below. Run this
          monthly, or after changing any of these credentials, to catch a dead token before a
          real emergency.
        </p>
      </div>

      <button
        type="button"
        className="vaultRecoveryChannelsTestButton"
        onClick={handleTestRecoveryChannels}
        disabled={isTesting}
      >
        {isTesting ? "Testing…" : "Run Test"}
      </button>

      {testResult && (
        <ul className="vaultRecoveryChannelsResultList">
          {testResult.results.map((result) => {
            // An optional channel that's simply not configured (the
            // secondary webhook) is neither a pass nor a fail — show
            // it as a neutral "skipped" row instead of a red failure.
            const isSkipped = result.optional && result.status === "skipped";
            const rowState = isSkipped ? "skip" : result.passed ? "pass" : "fail";
            const icon = isSkipped ? "○" : result.passed ? "✓" : "✕";

            return (
              <li
                key={result.channel}
                className={`vaultRecoveryChannelsResultRow vaultRecoveryChannelsResultRow--${rowState}`}
              >
                <span className="vaultRecoveryChannelsResultLabel">
                  {icon} {result.label}
                  {result.optional && <span className="vaultRecoveryChannelsOptionalTag">Optional</span>}
                </span>
                <span className="vaultRecoveryChannelsResultMessage">{result.message}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
