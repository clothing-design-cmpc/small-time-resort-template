/**
 * FILE: app/superAdmin/(protected)/settings/vault-passphrase/VaultPassphraseClient.jsx
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * Single button that generates a brand-new /system-vault-x9f2 recovery
 * passphrase and shows it exactly once. No terminal, no .env.local
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
 *    saves it, returns the PLAINTEXT once -> shown in a copyable box
 *    with a "copied!" toast, and a clear warning it won't be shown again
 */
"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";

export default function VaultPassphraseClient() {
  const { toasts, showToast, dismissToast } = useToast();

  // Whether a passphrase currently exists at all — fetched once on
  // mount, purely informational (never the passphrase value itself).
  const [isConfigured, setIsConfigured] = useState(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  // Only ever populated immediately after a successful generate — never
  // fetched, never persisted across a page reload.
  const [revealedPassphrase, setRevealedPassphrase] = useState(null);

  // Fires once on load — just to show accurate status text, never the
  // passphrase itself (that only ever exists after a fresh generate).
  useEffect(() => {
    async function checkStatus() {
      try {
        const response = await fetch("/api/superAdmin/settings/vault-passphrase");
        const result = await response.json();
        setIsConfigured(result?.data?.isConfigured ?? false);
      } catch {
        setIsConfigured(null);
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
    setIsConfigured(true);
    setIsModalOpen(false);
    showToast("✓ New vault passphrase generated.", "success");
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
          This is the passphrase for the hidden disaster-recovery page
          (<code>/system-vault-x9f2</code>). It is the first of two steps
          needed to access it — you'll still get a 6-digit code emailed
          to you as the second step.
        </p>
      </div>

      <div className="vaultPassphraseCard">
        <div className="vaultPassphraseStatusRow">
          <span className="vaultPassphraseStatusLabel">Current status:</span>
          {isCheckingStatus && <span className="vaultPassphraseStatusValue">Checking…</span>}
          {!isCheckingStatus && isConfigured && (
            <span className="vaultPassphraseStatusValue vaultPassphraseStatusValue--set">
              A passphrase is currently set
            </span>
          )}
          {!isCheckingStatus && !isConfigured && (
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
              Your new passphrase — copy it now, it will not be shown again:
            </span>
            <div className="vaultPassphraseRevealValueRow">
              <code className="vaultPassphraseRevealValue">{revealedPassphrase}</code>
              <button type="button" className="vaultPassphraseCopyButton" onClick={handleCopy}>
                Copy
              </button>
            </div>
            <p className="vaultPassphraseRevealHint">
              Save this somewhere safe — a password manager, or written
              down somewhere only you can access. It cannot be recovered
              later; only replaced with a new one.
            </p>
          </div>
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
