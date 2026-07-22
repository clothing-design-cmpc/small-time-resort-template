/**
 * FILE: app/superAdmin/(protected)/settings/vault-passphrase/VaultPassphraseClient.jsx
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * Single button that generates a brand-new vault recovery passphrase
 * and shows it exactly once. No terminal, no .env.local
 * editing, no scripts/hashVaultPassphrase.js — the owner logs into the
 * dashboard they already use every day and clicks one button.
 *
 * DATA FLOW:
 * 1. On mount: GET /api/superAdmin/settings/vault-passphrase — just
 *    checks whether a passphrase currently exists, so the page can
 *    show "No passphrase set yet" vs "A passphrase is currently set"
 * 2. "Generate New Passphrase" -> confirmation modal (this invalidates
 *    whatever passphrase used to work, same as an auto-rotation would)
 * 3. On confirm: POST the same endpoint -> server generates + hashes +
 *    saves it, returns the PLAINTEXT once -> never rendered on screen;
 *    only a "generated" confirmation is shown, with a "Copy to
 *    clipboard" button (copies from state, not from visible text) and
 *    the email/Drive delivery status
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";

// How long the "passphrase generated" confirmation box stays visible
// before auto-hiding itself. The passphrase text is never shown here
// either way (only the delivery confirmation is) — this just keeps the
// box from sitting on screen indefinitely if the admin walks away.
const REVEAL_AUTO_HIDE_MS = 30 * 1000;

export default function VaultPassphraseClient() {
  const { toasts, showToast, dismissToast } = useToast();

  // Whether a passphrase currently exists at all — fetched once on
  // mount, purely informational (never the passphrase value itself).
  const [isConfigured, setIsConfigured] = useState(null);
  // "database" | "env_fallback" | "none" — lets the tracker tell apart a
  // real DB-set passphrase from the old .env.local value still working
  // only because it's never been rotated through this page yet.
  const [passphraseSource, setPassphraseSource] = useState(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  // Only ever populated immediately after a successful generate — never
  // fetched, never persisted across a page reload.
  const [revealedPassphrase, setRevealedPassphrase] = useState(null);
  const [deliveryStatus, setDeliveryStatus] = useState(null); // { emailSent, driveSaved, driveViewLink }
  // Tracks the pending auto-hide timeout so a second generate (or an
  // unmount) can clear the previous one instead of stacking timers.
  const autoHideTimerRef = useRef(null);

  // Test Recovery Channels — completely separate from the passphrase
  // state above. Never fetched on mount; only populated after the
  // owner explicitly clicks "Run Test" (Rule: read-only health check,
  // not something that should run silently on every page load).
  const [isTestingChannels, setIsTestingChannels] = useState(false);
  const [channelTestResult, setChannelTestResult] = useState(null);

  // Cleanup on unmount only — clears whatever timer is still pending
  // so it never fires setState after the page has navigated away.
  useEffect(() => {
    return () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    };
  }, []);

  // Fires once on load — just to show accurate status text, never the
  // passphrase itself (that only ever exists after a fresh generate).
  useEffect(() => {
    async function checkStatus() {
      try {
        const response = await fetch("/api/superAdmin/settings/vault-passphrase");
        const result = await response.json();
        setIsConfigured(result?.data?.isConfigured ?? false);
        setPassphraseSource(result?.data?.source ?? null);
      } catch {
        setIsConfigured(null);
        setPassphraseSource(null);
      } finally {
        setIsCheckingStatus(false);
      }
    }
    checkStatus();
  }, []);

  /**
   * handleGenerate
   * Confirmed action — calls the API, reveals the new plaintext
   * passphrase on screen, and fires a toast. Never throws past this
   * function; any failure just shows an error toast and leaves the
   * old passphrase (if any) untouched, since the server only writes
   * the new hash after it's fully generated.
   */
  async function handleGenerate() {
    let response;
    try {
      response = await fetch("/api/superAdmin/settings/vault-passphrase", { method: "POST" });
    } catch {
      showToast("✕ Network error — please try again.", "error");
      setIsModalOpen(false);
      return;
    }

    const result = await response.json();

    if (!result.success) {
      showToast(`✕ ${result.message || "Failed to generate a new passphrase."}`, "error");
      setIsModalOpen(false);
      return;
    }

    setRevealedPassphrase(result.data.passphrase);
    setDeliveryStatus({
      emailSent: result.data.emailSent,
      driveSaved: result.data.driveSaved,
      driveViewLink: result.data.driveViewLink,
    });
    setIsConfigured(true);
    setPassphraseSource("database");
    setIsModalOpen(false);

    // Reset the auto-hide window every time a fresh passphrase is
    // revealed — clears any timer left over from a previous generate
    // so the box always gets the full 30s from the moment it appears.
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    autoHideTimerRef.current = setTimeout(() => {
      setRevealedPassphrase(null);
      setDeliveryStatus(null);
    }, REVEAL_AUTO_HIDE_MS);

    if (result.data.emailSent && result.data.driveSaved) {
      showToast("✓ New passphrase generated, emailed, and saved to Drive.", "success");
    } else {
      showToast("⚠ Passphrase generated — check below, email or Drive save may have failed.", "warning");
    }
  }

  /**
   * handleTestRecoveryChannels
   * Runs the read-only dry-run checks (GitHub, Drive, EmailJS) and
   * shows per-channel results. Never touches the passphrase itself —
   * completely independent of handleGenerate above.
   */
  async function handleTestRecoveryChannels() {
    setIsTestingChannels(true);
    setChannelTestResult(null);

    let response;
    try {
      response = await fetch("/api/superAdmin/settings/vault-passphrase/test-recovery-channels", {
        method: "POST",
      });
    } catch {
      showToast("✕ Network error — please try again.", "error");
      setIsTestingChannels(false);
      return;
    }

    const result = await response.json();

    if (!result.success) {
      showToast(`✕ ${result.message || "Failed to run the recovery channel tests."}`, "error");
      setIsTestingChannels(false);
      return;
    }

    setChannelTestResult(result.data);
    setIsTestingChannels(false);

    if (result.data.allPassed) {
      showToast("✓ All recovery channels are working.", "success");
    } else {
      showToast(`⚠ ${result.data.passedCount}/${result.data.totalCount} recovery channels are working — see details below.`, "warning");
    }
  }

  /**
   * handleCopy
   * Copies the revealed passphrase to the clipboard so the owner can
   * paste it straight into a password manager without retyping it
   * (retyping a random word string is where transcription errors
   * happen — same failure mode that caused the earlier "Incorrect
   * passphrase" mismatch).
   */
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(revealedPassphrase);
      showToast("✓ Copied to clipboard.", "success");
    } catch {
      showToast("✕ Couldn't copy automatically — please copy it manually.", "error");
    }
  }

  return (
    <section className="vaultPassphraseSettingsSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="vaultPassphraseSettingsHeader">
        <h1>Vault Passphrase</h1>
        <p>
          This is the passphrase for the hidden disaster-recovery page.
        </p>
      </div>

      <div className="vaultPassphraseCard">
        <div className="vaultPassphraseStatusRow">
          <span className="vaultPassphraseStatusLabel">Current status:</span>
          {isCheckingStatus && <span className="vaultPassphraseStatusValue">Checking…</span>}
          {!isCheckingStatus && passphraseSource === "database" && (
            <span className="vaultPassphraseStatusValue vaultPassphraseStatusValue--set">
              A passphrase is currently set
            </span>
          )}
          {!isCheckingStatus && passphraseSource === "env_fallback" && (
            <span className="vaultPassphraseStatusValue vaultPassphraseStatusValue--legacy">
              Legacy passphrase active (never generated here) — generate one now to store it properly
            </span>
          )}
          {!isCheckingStatus && (passphraseSource === "none" || !isConfigured) && (
            <span className="vaultPassphraseStatusValue vaultPassphraseStatusValue--unset">
              No passphrase set yet
            </span>
          )}
        </div>

        <p className="vaultPassphraseWarning">
          Generating a new passphrase immediately replaces the old one —
          if you had one memorized or saved before, it will stop working
          the moment you click Generate.
        </p>

        <button
          type="button"
          className="vaultPassphraseGenerateButton"
          onClick={() => setIsModalOpen(true)}
        >
          Generate New Passphrase
        </button>

        {revealedPassphrase && (
          <div className="vaultPassphraseRevealBox">
            <span className="vaultPassphraseRevealLabel">
              ✓ A new passphrase has been generated.
            </span>
            <p className="vaultPassphraseRevealHint">
              It has been delivered through the channels below — it is
              never shown on this page and cannot be viewed again after
              this message. Use "Copy to clipboard" now if you'd like to
              paste it into a password manager without seeing it on screen.
            </p>
            <button type="button" className="vaultPassphraseCopyButton" onClick={handleCopy}>
              Copy to clipboard
            </button>

            {deliveryStatus && (
              <ul className="vaultPassphraseDeliveryList">
                <li className={deliveryStatus.emailSent ? "vaultPassphraseDelivery--ok" : "vaultPassphraseDelivery--fail"}>
                  {deliveryStatus.emailSent
                    ? "✓ Emailed to the vault owner's inbox."
                    : "✕ Email failed to send — use \"Copy to clipboard\" above instead."}
                </li>
                <li className={deliveryStatus.driveSaved ? "vaultPassphraseDelivery--ok" : "vaultPassphraseDelivery--fail"}>
                  {deliveryStatus.driveSaved ? (
                    <>
                      ✓ Saved to Google Drive as a .txt file.{" "}
                      {deliveryStatus.driveViewLink && (
                        <a href={deliveryStatus.driveViewLink} target="_blank" rel="noopener noreferrer">
                          Open file
                        </a>
                      )}
                    </>
                  ) : (
                    "✕ Drive save failed — use \"Copy to clipboard\" above instead."
                  )}
                </li>
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="recoveryChannelsCard">
        <h2>Test Recovery Channels</h2>
        <p>
          Confirms GitHub Actions, Google Drive, EmailJS, and the optional
          secondary alert webhook are all reachable — without rotating the
          passphrase, running a backup, or sending a real email. (The
          webhook check does send one real, clearly-labeled test message,
          since unlike EmailJS it costs nothing to send.) Run this
          monthly, or after changing any of these credentials, to catch a
          dead token before a real emergency.
        </p>

        <button
          type="button"
          className="recoveryChannelsTestButton"
          onClick={handleTestRecoveryChannels}
          disabled={isTestingChannels}
        >
          {isTestingChannels ? "Testing…" : "Run Test"}
        </button>

        {channelTestResult && (
          <ul className="recoveryChannelsResultList">
            {channelTestResult.results.map((result) => (
              <li
                key={result.channel}
                className={`recoveryChannelsResultRow ${
                  result.passed ? "recoveryChannelsResultRow--pass" : "recoveryChannelsResultRow--fail"
                }`}
              >
                <span className="recoveryChannelsResultLabel">
                  {result.passed ? "✓" : "✕"} {result.label}
                </span>
                <span className="recoveryChannelsResultMessage">{result.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmationModal
        isOpen={isModalOpen}
        title="Generate New Vault Passphrase?"
        description="This replaces the current vault passphrase immediately. Anyone with the old one (including you, if you don't save the new one) will be locked out of the recovery page. This cannot be undone."
        confirmLabel="Generate New Passphrase"
        onConfirm={handleGenerate}
        onCancel={() => setIsModalOpen(false)}
      />
    </section>
  );
}