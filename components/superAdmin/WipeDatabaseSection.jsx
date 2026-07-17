/**
 * FILE: components/superAdmin/WipeDatabaseSection.jsx
 * ROLE: Super-admin only — rendered inside the Backups page
 *
 * PURPOSE:
 * "Danger Zone" section that lets a super-admin schedule a full
 * database wipe. The super-admin's own choice — no forced soft-wipe:
 *   - "Back up first, then wipe"  (backupOption: "with_backup")
 *   - "Wipe WITHOUT backing up"   (backupOption: "without_backup")
 * Scheduling only ever creates a DatabaseWipeRequest row 24 hours out
 * (services/databaseWipeRequest.js) — nothing destructive happens from
 * this component. The actual TRUNCATE (and pre-wipe backup, if chosen)
 * runs later, decoupled, on GitHub Actions
 * (scripts/runDatabaseWipe.js), same as the nightly backup.
 *
 * DATA FLOW:
 * 1. On mount and every 30s, GET /api/superAdmin/wipe — shows either
 *    the "Wipe Database" button (no active request) or a live
 *    countdown card with a Cancel button (active request)
 * 2. "Wipe Database" -> opens the initiate modal -> choose backup
 *    option -> type "WIPE DATABASE" exactly -> Confirm enables ->
 *    POST /api/superAdmin/wipe
 * 3. "Cancel scheduled wipe" -> DELETE /api/superAdmin/wipe
 * 4. Once time remaining reaches 2 hours, DatabaseWipeGraceModal (
 *    mounted globally in the (protected) layout) takes over as the
 *    final, non-dismissible checkpoint — this component keeps showing
 *    the same countdown card underneath it either way
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import "./WipeDatabaseSection.css";

const POLL_INTERVAL_MS = 30 * 1000;
const REQUIRED_CONFIRMATION_TEXT = "WIPE DATABASE";

/** Formats whole milliseconds remaining as "Hh Mm" for the countdown card. */
function formatRemaining(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export default function WipeDatabaseSection() {
  const { toasts, showToast, dismissToast } = useToast();
  const [activeRequest, setActiveRequest] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [backupOption, setBackupOption] = useState("with_backup");
  const [confirmationText, setConfirmationText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const pollIntervalRef = useRef(null);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/superAdmin/wipe");
      const result = await response.json();
      setActiveRequest(result?.data ?? null);
    } catch {
      // Best-effort — the next poll retries; a failed status check
      // must never break the rest of the Backups page.
    }
  }, []);

  useEffect(() => {
    checkStatus();
    pollIntervalRef.current = setInterval(checkStatus, POLL_INTERVAL_MS);
    return () => clearInterval(pollIntervalRef.current);
  }, [checkStatus]);

  function openModal() {
    setBackupOption("with_backup");
    setConfirmationText("");
    setIsModalOpen(true);
  }

  function closeModal() {
    if (isSubmitting) return;
    setIsModalOpen(false);
  }

  /**
   * handleConfirmWipe
   * Submits the wipe request once the typed confirmation matches
   * exactly. The server re-validates the exact same text — this
   * client-side check only controls when the button enables.
   */
  async function handleConfirmWipe() {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/superAdmin/wipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupOption, confirmationText }),
      });
      const result = await response.json();

      if (!result.success) {
        showToast(result.message || "Failed to schedule the wipe.", "error");
        setIsSubmitting(false);
        return;
      }

      showToast("✓ " + result.message, "success");
      setIsModalOpen(false);
      setIsSubmitting(false);
      checkStatus();
    } catch {
      showToast("We couldn't reach the server. Check your connection and try again.", "error");
      setIsSubmitting(false);
    }
  }

  /**
   * handleCancelWipe
   * Cancels the currently scheduled wipe. Available at any point in
   * the grace period, including after the final-warning modal has
   * already appeared elsewhere on screen.
   */
  async function handleCancelWipe() {
    setIsCancelling(true);
    try {
      const response = await fetch("/api/superAdmin/wipe", { method: "DELETE" });
      const result = await response.json();

      if (!result.success) {
        showToast(result.message || "Failed to cancel the wipe.", "error");
        setIsCancelling(false);
        return;
      }

      showToast("✓ Scheduled wipe cancelled.", "success");
      setActiveRequest(null);
      setIsCancelling(false);
    } catch {
      showToast("We couldn't reach the server. Check your connection and try again.", "error");
      setIsCancelling(false);
    }
  }

  const isConfirmationValid = confirmationText === REQUIRED_CONFIRMATION_TEXT;

  return (
    <section className="wipeDatabaseSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="wipeDatabaseSectionHeader">
        <h2 className="wipeDatabaseSectionTitle">Danger Zone</h2>
        <p className="wipeDatabaseSectionSubtitle">
          Wiping the database is irreversible. A 24-hour grace period always applies, and you'll get a final
          warning 2 hours before it runs.
        </p>
      </div>

      {activeRequest ? (
        <article className="wipeDatabaseActiveCard">
          <div className="wipeDatabaseActiveCardText">
            <strong>Database wipe scheduled</strong>
            <span>
              {activeRequest.backupOption === "with_backup" ? "A backup will be taken first. " : "No backup will be taken. "}
              Executes in <strong>{formatRemaining(activeRequest.millisecondsRemaining)}</strong>.
            </span>
          </div>
          <button
            type="button"
            className="wipeDatabaseCancelButton"
            onClick={handleCancelWipe}
            disabled={isCancelling}
          >
            {isCancelling ? "Cancelling…" : "Cancel scheduled wipe"}
          </button>
        </article>
      ) : (
        <button type="button" className="wipeDatabaseTriggerButton" onClick={openModal}>
          Wipe Database
        </button>
      )}

      {isModalOpen && (
        <div className="wipeDatabaseModalBackdrop" role="dialog" aria-modal="true" aria-labelledby="wipeDatabaseModalTitle">
          <div className="wipeDatabaseModalDialog">
            <h2 id="wipeDatabaseModalTitle" className="wipeDatabaseModalTitle">
              Schedule a database wipe?
            </h2>
            <p className="wipeDatabaseModalDescription">
              This permanently erases all operational data. It will not run for 24 hours, and you'll get one final
              chance to cancel 2 hours before it executes.
            </p>

            <fieldset className="wipeDatabaseModalOptions">
              <legend>Backup option</legend>
              <label className="wipeDatabaseModalOption">
                <input
                  type="radio"
                  name="backupOption"
                  value="with_backup"
                  checked={backupOption === "with_backup"}
                  onChange={() => setBackupOption("with_backup")}
                />
                <span>
                  <strong>Back up first, then wipe</strong>
                  <small>Recommended — a full backup is taken right before the wipe runs.</small>
                </span>
              </label>
              <label className="wipeDatabaseModalOption wipeDatabaseModalOption--danger">
                <input
                  type="radio"
                  name="backupOption"
                  value="without_backup"
                  checked={backupOption === "without_backup"}
                  onChange={() => setBackupOption("without_backup")}
                />
                <span>
                  <strong>Wipe WITHOUT backing up</strong>
                  <small>No copy of the data will exist anywhere afterward.</small>
                </span>
              </label>
            </fieldset>

            <label className="wipeDatabaseModalConfirmLabel" htmlFor="wipeConfirmationText">
              Type <strong>{REQUIRED_CONFIRMATION_TEXT}</strong> to enable the confirm button
            </label>
            <input
              id="wipeConfirmationText"
              type="text"
              className="wipeDatabaseModalConfirmInput"
              value={confirmationText}
              onChange={(event) => setConfirmationText(event.target.value)}
              autoComplete="off"
              autoFocus
            />

            <div className="wipeDatabaseModalActions">
              <button type="button" className="wipeDatabaseModalButtonNeutral" onClick={closeModal} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="button"
                className="wipeDatabaseModalButtonDestructive"
                onClick={handleConfirmWipe}
                disabled={!isConfirmationValid || isSubmitting}
              >
                {isSubmitting ? "Scheduling…" : "Schedule wipe"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
