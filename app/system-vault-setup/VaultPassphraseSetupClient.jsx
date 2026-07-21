/**
 * FILE: app/system-vault-setup/VaultPassphraseSetupClient.jsx
 * ROLE: Owner only — gated by page.jsx server-side, re-checked again
 *       by app/api/system-vault-setup/route.js on every request.
 *
 * PURPOSE:
 * Single button that generates a brand-new vault recovery passphrase
 * into the new, dedicated VaultPassphrase table and shows it exactly
 * once. Deliberately plain markup — no Sidebar, no AdminHeader, no
 * dashboard chrome — since this page is meant to be reached only by
 * its exact hidden URL, never by navigating the admin dashboard.
 *
 * DATA FLOW:
 * 1. On mount: GET /api/system-vault-setup — just checks whether a
 *    passphrase currently exists in the new table, so the page can
 *    show "No passphrase set yet" vs "A passphrase is currently set"
 * 2. "Generate New Passphrase" -> confirmation modal (this invalidates
 *    whatever passphrase used to work, same as an auto-rotation would)
 * 3. On confirm: POST the same endpoint -> server generates + hashes +
 *    saves it, returns the PLAINTEXT once -> never rendered on screen;
 *    only a "generated" confirmation is shown, with a "Copy to
 *    clipboard" button (copies from state, not from visible text) and
 *    the email/Drive delivery status
 *
 * vaultSetupKey PROP:
 * Set by page.jsx only when the page itself was reached via a valid
 * "?key=" query string instead of the normal admin session cookie
 * (see services/adminSession.js's isValidVaultSetupKey()). A
 * key-authenticated page load has no session cookie for these fetch
 * calls to ride along on, so every request below forwards the same
 * key as an "x-vault-setup-key" header — the API route accepts either
 * credential independently, same as the page itself does.
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

const SETUP_ENDPOINT = "/api/system-vault-setup";

export default function VaultPassphraseSetupClient({ vaultSetupKey = null }) {
  // Only attached when this page load was key-authenticated — omitted
  // entirely (not sent as an empty string) on a normal session-based
  // visit, so the API route's own check behaves identically to before.
  const setupKeyHeaders = vaultSetupKey ? { "x-vault-setup-key": vaultSetupKey } : undefined;

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

  // Cleanup on unmount only — clears whatever timer is still pending
  // so it never fires setState after the page has navigated away.
  useEffect(() => {
    return () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    };
  }, []);

  /**
   * revealPassphrase
   * Shared by checkStatus's auto-generate-on-first-load path and
   * handleGenerate's manual click — puts a freshly generated plaintext
   * on screen exactly once, resets the 30s auto-hide window, and fires
   * a toast. Kept as one function so the two entry points can never
   * drift into showing the reveal box differently.
   */
  function revealPassphrase(data, toastMessage) {
    setRevealedPassphrase(data.passphrase);
    setDeliveryStatus({
      emailSent: data.emailSent,
      driveSaved: data.driveSaved,
      driveViewLink: data.driveViewLink,
    });
    setIsConfigured(true);
    setPassphraseSource("database");

    // Reset the auto-hide window every time a fresh passphrase is
    // revealed — clears any timer left over from a previous generate
    // so the box always gets the full 30s from the moment it appears.
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    autoHideTimerRef.current = setTimeout(() => {
      setRevealedPassphrase(null);
      setDeliveryStatus(null);
    }, REVEAL_AUTO_HIDE_MS);

    if (data.emailSent && data.driveSaved) {
      showToast(toastMessage, "success");
    } else {
      showToast("⚠ Passphrase generated — check below, email or Drive save may have failed.", "warning");
    }
  }

  // Fires once on load — normally just shows accurate status text,
  // never the passphrase itself. EXCEPTION: if the server found nothing
  // configured at all, it auto-generates one right there (see the API
  // route's GET handler) and this response carries that plaintext back
  // in data.passphrase — the ONE time GET can return it, so it has to
  // be revealed here immediately or it's gone for good.
  useEffect(() => {
    async function checkStatus() {
      try {
        const response = await fetch(SETUP_ENDPOINT, { headers: setupKeyHeaders });
        const result = await response.json();
        setIsConfigured(result?.data?.isConfigured ?? false);
        setPassphraseSource(result?.data?.source ?? null);

        if (result?.success && result?.data?.autoGenerated && result?.data?.passphrase) {
          revealPassphrase(
            result.data,
            "✓ No passphrase existed yet — a new one was generated automatically."
          );
        }
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
      response = await fetch(SETUP_ENDPOINT, { method: "POST", headers: setupKeyHeaders });
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

    setIsModalOpen(false);
    revealPassphrase(result.data, "✓ New passphrase generated, emailed, and saved to Drive.");
  }

  /**
   * handleCopy
   * Copies the revealed passphrase to the clipboard so the owner can
   * paste it straight into a password manager without retyping it
   * (retyping a random word string is where transcription errors
   * happen).
   */
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(revealedPassphrase);
      showToast("✓ Copied to clipboard.", "success");
    } catch {
      showToast("✕ Couldn't copy automatically — please copy it manually.", "error");
    }
  }

  // --- VAULT_SETUP_KEY / CRON_SECRET generation ---
  // Mirrors the passphrase flow's UX (confirm modal -> reveal-once box
  // -> copy button -> auto-hide) but deliberately generates entirely
  // client-side and is NEVER sent to any server or written to any
  // database table — both of these are meant to live only in
  // .env.local / the deployment's own env config. See
  // services/adminSession.js's isValidVaultSetupKey() docblock for why
  // VAULT_SETUP_KEY specifically must never touch the database: its
  // whole purpose is surviving a full TRUNCATE untouched.
  const [envSecretModalTarget, setEnvSecretModalTarget] = useState(null); // "VAULT_SETUP_KEY" | "CRON_SECRET" | null
  const [revealedEnvSecret, setRevealedEnvSecret] = useState(null); // { name, value }
  const envSecretAutoHideTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (envSecretAutoHideTimerRef.current) clearTimeout(envSecretAutoHideTimerRef.current);
    };
  }, []);

  /**
   * generateRandomEnvSecretValue
   * 32 random bytes from the browser's own CSPRNG (window.crypto,
   * never Math.random), base64url-encoded — same format and strength
   * as crypto.randomBytes(32).toString("base64url") on the server
   * side, just done in-browser so the value never has to leave this
   * tab to be generated.
   */
  function generateRandomEnvSecretValue() {
    const bytes = window.crypto.getRandomValues(new Uint8Array(32));
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function handleGenerateEnvSecret() {
    const name = envSecretModalTarget;
    setEnvSecretModalTarget(null);

    const value = generateRandomEnvSecretValue();
    setRevealedEnvSecret({ name, value });

    if (envSecretAutoHideTimerRef.current) clearTimeout(envSecretAutoHideTimerRef.current);
    envSecretAutoHideTimerRef.current = setTimeout(() => {
      setRevealedEnvSecret(null);
    }, REVEAL_AUTO_HIDE_MS);
  }

  async function handleCopyEnvSecret() {
    try {
      await navigator.clipboard.writeText(revealedEnvSecret.value);
      showToast("✓ Copied to clipboard.", "success");
    } catch {
      showToast("✕ Couldn't copy automatically — please copy it manually.", "error");
    }
  }

  return (
    <section className="vaultPassphraseSetupSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="vaultPassphraseSetupHeader">
        <h1>Vault Passphrase Setup</h1>
        <p>
          Generates a passphrase into the new, dedicated passphrase
          table for the hidden disaster-recovery page.
        </p>
      </div>

      <div className="vaultPassphraseSetupCard">
        <div className="vaultPassphraseSetupStatusRow">
          <span className="vaultPassphraseSetupStatusLabel">Current status:</span>
          {isCheckingStatus && <span className="vaultPassphraseSetupStatusValue">Checking…</span>}
          {!isCheckingStatus && passphraseSource === "database" && (
            <span className="vaultPassphraseSetupStatusValue vaultPassphraseSetupStatusValue--set">
              A passphrase is currently set
            </span>
          )}
          {!isCheckingStatus && passphraseSource === "env_fallback" && (
            <span className="vaultPassphraseSetupStatusValue vaultPassphraseSetupStatusValue--legacy">
              Legacy passphrase active (never generated here) — generate one now to store it properly
            </span>
          )}
          {!isCheckingStatus && (passphraseSource === "none" || !isConfigured) && (
            <span className="vaultPassphraseSetupStatusValue vaultPassphraseSetupStatusValue--unset">
              No passphrase set yet
            </span>
          )}
        </div>

        <p className="vaultPassphraseSetupWarning">
          Generating a new passphrase immediately replaces the old one —
          if you had one memorized or saved before, it will stop working
          the moment you click Generate.
        </p>

        <button
          type="button"
          className="vaultPassphraseSetupButton"
          onClick={() => setIsModalOpen(true)}
        >
          Generate New Passphrase
        </button>

        {revealedPassphrase && (
          <div className="vaultPassphraseSetupRevealBox">
            <span className="vaultPassphraseSetupRevealLabel">
              ✓ A new passphrase has been generated.
            </span>
            <p className="vaultPassphraseSetupRevealHint">
              It has been delivered through the channels below — it is
              never shown on this page and cannot be viewed again after
              this message. Use "Copy to clipboard" now if you'd like to
              paste it into a password manager without seeing it on screen.
            </p>
            <button type="button" className="vaultPassphraseSetupCopyButton" onClick={handleCopy}>
              Copy to clipboard
            </button>

            {deliveryStatus && (
              <ul className="vaultPassphraseSetupDeliveryList">
                <li className={deliveryStatus.emailSent ? "vaultPassphraseSetupDelivery--ok" : "vaultPassphraseSetupDelivery--fail"}>
                  {deliveryStatus.emailSent
                    ? "✓ Emailed to the vault owner's inbox."
                    : "✕ Email failed to send — use \"Copy to clipboard\" above instead."}
                </li>
                <li className={deliveryStatus.driveSaved ? "vaultPassphraseSetupDelivery--ok" : "vaultPassphraseSetupDelivery--fail"}>
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

      <div className="vaultPassphraseSetupCard">
        <div className="vaultPassphraseSetupHeader" style={{ marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>Other Setup Secrets</h2>
          <p>
            Generated entirely in your browser — never sent to any server or saved anywhere. Copy the
            value straight into <code>.env.local</code> (and your deployment's env vars) yourself.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="vaultPassphraseSetupButton"
            onClick={() => setEnvSecretModalTarget("VAULT_SETUP_KEY")}
          >
            Generate VAULT_SETUP_KEY
          </button>
          <button
            type="button"
            className="vaultPassphraseSetupButton"
            onClick={() => setEnvSecretModalTarget("CRON_SECRET")}
          >
            Generate CRON_SECRET
          </button>
        </div>

        {revealedEnvSecret && (
          <div className="vaultPassphraseSetupRevealBox">
            <span className="vaultPassphraseSetupRevealLabel">
              ✓ New {revealedEnvSecret.name} generated.
            </span>
            <p className="vaultPassphraseSetupRevealHint">
              This value only exists in this browser tab right now — it was never sent anywhere and
              cannot be regenerated to the same value. Copy it now and paste it into{" "}
              <code>.env.local</code> as <code>{revealedEnvSecret.name}=...</code>
              {revealedEnvSecret.name === "CRON_SECRET"
                ? ", and update your Vercel Cron config to match."
                : "."}
            </p>
            <code className="adminMono" style={{ wordBreak: "break-all", display: "block", margin: "0.5rem 0" }}>
              {revealedEnvSecret.value}
            </code>
            <button type="button" className="vaultPassphraseSetupCopyButton" onClick={handleCopyEnvSecret}>
              Copy to clipboard
            </button>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={Boolean(envSecretModalTarget)}
        title={`Generate New ${envSecretModalTarget}?`}
        description={
          envSecretModalTarget === "CRON_SECRET"
            ? "This is only generated for you to copy — nothing is saved. If you already have a CRON_SECRET configured elsewhere (e.g. Vercel Cron), you'll need to update it there too, or the auto-rotate cron job will start failing its auth check."
            : "This is only generated for you to copy — nothing is saved. If you already have a VAULT_SETUP_KEY configured in a live deployment, the old one keeps working there until you replace it — this doesn't invalidate anything by itself."
        }
        confirmLabel="Generate"
        onConfirm={handleGenerateEnvSecret}
        onCancel={() => setEnvSecretModalTarget(null)}
      />

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