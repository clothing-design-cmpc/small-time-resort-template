/**
 * FILE: components/superAdmin/DatabaseWipeGraceModal.jsx
 * ROLE: Super-admin only — mounted once inside the authenticated shell
 *
 * PURPOSE:
 * Non-dismissible, final-warning modal for the "Wipe Database"
 * danger-zone feature. Once a scheduled wipe has 2 hours or less
 * remaining, this appears on EVERY super-admin page (mounted at layout
 * level, same as BreachAlertBanner) and blocks all other interaction
 * until the super-admin makes an explicit choice:
 *   - "Continue"       -> the wipe proceeds as scheduled
 *   - "Don't continue" -> the wipe is cancelled outright
 * There is deliberately no backdrop click, Escape key, or X button to
 * dismiss this — a super-admin who never resolves it can't accidentally
 * let an irreversible wipe execute unnoticed.
 *
 * DATA FLOW:
 * 1. Polls GET /api/superAdmin/wipe every 30 seconds on every
 *    authenticated page. That route computes shouldShowFinalWarning
 *    (time remaining <= 2h AND not yet finalConfirmedAt) — this
 *    component just reflects that flag.
 * 2. Once shown, a local per-second countdown ticks down from the
 *    server's scheduledAt so the on-screen clock stays smooth between
 *    polls, same pattern as VaultOtpClient's countdown.
 * 3. "Continue"       -> PATCH /api/superAdmin/wipe/confirm, then hides
 * 4. "Don't continue" -> DELETE /api/superAdmin/wipe, then hides
 */
"use client";

import { useEffect, useRef, useState } from "react";
import "./DatabaseWipeGraceModal.css";

const POLL_INTERVAL_MS = 30 * 1000;

/** Formats whole milliseconds remaining as "Hh MMm SSs". */
function formatRemaining(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

export default function DatabaseWipeGraceModal() {
  const [wipeRequest, setWipeRequest] = useState(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pollIntervalRef = useRef(null);
  const tickIntervalRef = useRef(null);

  /**
   * checkWipeStatus
   * Fetches the current wipe status. Best-effort — a failed poll must
   * never crash the admin panel, it just tries again on the next cycle.
   */
  async function checkWipeStatus() {
    try {
      const response = await fetch("/api/superAdmin/wipe");
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
   * Confirms the wipe should proceed as scheduled — the executor
   * script (scripts/runDatabaseWipe.js) only ever touches the database
   * for requests where this has been explicitly set.
   */
  async function handleContinue() {
    setIsSubmitting(true);
    try {
      await fetch("/api/superAdmin/wipe/confirm", { method: "PATCH" });
    } catch {
      // Best-effort — if this fails, the next poll simply shows the
      // modal again, so the admin is never silently let through
      // without actually confirming.
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
      await fetch("/api/superAdmin/wipe", { method: "DELETE" });
    } catch {
      // Best-effort — worst case the modal reappears and the admin
      // retries; the wipe still requires finalConfirmedAt to ever
      // execute, so nothing destructive happens from this failing.
    }
    setIsSubmitting(false);
    setWipeRequest(null);
  }

  if (!wipeRequest) return null;

  return (
    // Deliberately no onClick on the backdrop and no Escape-key
    // listener anywhere in this component — this modal cannot be
    // dismissed except by an explicit Continue / Don't continue choice.
    <div
      className="wipeGraceModalBackdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="wipeGraceModalTitle"
    >
      <div className="wipeGraceModalDialog">
        <span className="wipeGraceModalIcon" aria-hidden="true">
          ⚠
        </span>
        <h2 id="wipeGraceModalTitle" className="wipeGraceModalTitle">
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
