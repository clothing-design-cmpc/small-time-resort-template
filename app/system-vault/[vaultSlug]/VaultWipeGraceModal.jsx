/**
 * FILE: app/system-vault/[vaultSlug]/VaultWipeGraceModal.jsx
 * ROLE: Standalone — mounted once inside RecoveryClient.jsx
 *
 * PURPOSE:
 * Vault-side mirror of components/superAdmin/DatabaseWipeGraceModal.jsx.
 * Referenced by VaultDangerZoneSection.jsx's own header comment and by
 * app/api/admin/vault-wipe/confirm/route.js's own header comment, but
 * never actually built — meaning a wipe scheduled FROM the vault (no
 * regular super-admin session active) had no final checkpoint at all
 * once it hit the 2-hour mark unless someone happened to also be on
 * the super-admin Backups page. This makes the vault's own Danger Zone
 * behave identically to the super-admin one: non-dismissible, blocks
 * everything else on this page until an explicit choice is made.
 *
 * DATA FLOW:
 * 1. Polls GET /api/admin/vault-wipe every 30 seconds while mounted.
 *    That route computes shouldShowFinalWarning (time remaining <= 2h
 *    AND not yet finalConfirmedAt) exactly like the super-admin route
 *    does — same shared services/databaseWipeRequest.js helpers.
 * 2. Once shown, a local per-second countdown ticks down from the
 *    server's scheduledAt so the on-screen clock stays smooth between
 *    polls, same pattern as DatabaseWipeGraceModal.
 * 3. "Continue"       -> PATCH /api/admin/vault-wipe/confirm, then hides
 * 4. "Don't continue" -> DELETE /api/admin/vault-wipe, then hides
 * No step-up code is required for either choice here — same reasoning
 * as VaultDangerZoneSection's "Cancel scheduled wipe": this page is
 * already behind the full passphrase + OTP vault session, and neither
 * choice can make the outcome less safe than doing nothing.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import "@/components/superAdmin/DatabaseWipeGraceModal.css";

const POLL_INTERVAL_MS = 30 * 1000;

/** Formats whole milliseconds remaining as "Hh MMm SSs". */
function formatRemaining(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

export default function VaultWipeGraceModal({ showToast }) {
  const [wipeRequest, setWipeRequest] = useState(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pollIntervalRef = useRef(null);
  const tickIntervalRef = useRef(null);

  /**
   * checkWipeStatus
   * Fetches the current wipe status. Best-effort — a failed poll must
   * never crash the recovery page, it just tries again on the next cycle.
   */
  async function checkWipeStatus() {
    try {
      const response = await fetch("/api/admin/vault-wipe");
      const result = await response.json();
      if (result?.data?.shouldShowFinalWarning) {
        setWipeRequest(result.data);
        setRemainingMs(result.data.millisecondsRemaining);
      } else {
        setWipeRequest(null);
      }
    } catch {
      // Ignore — the next poll retries.
    }
  }

  useEffect(() => {
    checkWipeStatus();
    pollIntervalRef.current = setInterval(checkWipeStatus, POLL_INTERVAL_MS);
    return () => clearInterval(pollIntervalRef.current);
  }, []);

  // Local per-second countdown — only runs while the modal is actually
  // showing, so it never ticks (and re-renders) on every other page load.
  useEffect(() => {
    clearInterval(tickIntervalRef.current);
    if (!wipeRequest) return;

    tickIntervalRef.current = setInterval(() => {
      setRemainingMs((current) => Math.max(0, current - 1000));
    }, 1000);

    return () => clearInterval(tickIntervalRef.current);
  }, [wipeRequest]);

  /**
   * handleContinue
   * Confirms the wipe should proceed as scheduled — same
   * finalConfirmedAt flag scripts/runDatabaseWipe.js checks regardless
   * of whether it was set from here or from the super-admin panel.
   */
  async function handleContinue() {
    setIsSubmitting(true);
    try {
      await fetch("/api/admin/vault-wipe/confirm", { method: "PATCH" });
      showToast?.("✓ Confirmed. The wipe will proceed as scheduled.", "success");
    } catch {
      // Best-effort — if this fails, the next poll simply shows the
      // modal again, so the owner is never silently let through
      // without actually confirming.
      showToast?.("✕ We couldn't reach the server. Check your connection and try again.", "error");
    }
    setIsSubmitting(false);
    setWipeRequest(null);
  }

  /**
   * handleDontContinue
   * Cancels the wipe outright — the safer default action whenever
   * there's any doubt on an irreversible operation.
   */
  async function handleDontContinue() {
    setIsSubmitting(true);
    try {
      await fetch("/api/admin/vault-wipe", { method: "DELETE" });
      showToast?.("✓ Scheduled wipe cancelled.", "success");
    } catch {
      // Best-effort — worst case the modal reappears and the owner
      // retries; the wipe still requires finalConfirmedAt to ever
      // execute, so nothing destructive happens from this failing.
      showToast?.("✕ We couldn't reach the server. Check your connection and try again.", "error");
    }
    setIsSubmitting(false);
    setWipeRequest(null);
  }

  if (!wipeRequest) return null;

  return (
    // Deliberately no onClick on the backdrop and no Escape-key
    // listener anywhere in this component — mirrors
    // DatabaseWipeGraceModal exactly: cannot be dismissed except by an
    // explicit Continue / Don't continue choice.
    <div
      className="wipeGraceModalBackdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="vaultWipeGraceModalTitle"
    >
      <div className="wipeGraceModalDialog">
        <span className="wipeGraceModalIcon" aria-hidden="true">
          ⚠
        </span>
        <h2 id="vaultWipeGraceModalTitle" className="wipeGraceModalTitle">
          Final warning — database wipe pending
        </h2>
        <p className="wipeGraceModalDescription">
          A scheduled database wipe (
          {wipeRequest.backupOption === "with_backup" ? "with a backup taken first" : "WITHOUT a backup"}) will
          execute in:
        </p>
        <p className="wipeGraceModalCountdown" aria-live="polite">
          {formatRemaining(remainingMs)}
        </p>
        <p className="wipeGraceModalDescription">
          This is your last chance to cancel. Choosing "Continue" lets the wipe proceed as scheduled — it cannot
          be undone once it runs.
        </p>
        <div className="wipeGraceModalActions">
          <button
            type="button"
            className="wipeGraceModalButtonCancel"
            onClick={handleDontContinue}
            disabled={isSubmitting}
          >
            Don't continue
          </button>
          <button
            type="button"
            className="wipeGraceModalButtonContinue"
            onClick={handleContinue}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Processing…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}