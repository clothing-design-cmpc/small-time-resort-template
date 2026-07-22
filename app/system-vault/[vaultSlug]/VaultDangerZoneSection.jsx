/**
 * FILE: app/system-vault/[vaultSlug]/VaultDangerZoneSection.jsx
 * ROLE: Standalone — rendered inside RecoveryClient.jsx only
 *
 * PURPOSE:
 * The vault recovery page's own "Danger Zone" — mirrors
 * components/superAdmin/WipeDatabaseSection.jsx (same choice between
 * "Back up first, then wipe" and "Wipe WITHOUT backing up", same typed
 * "WIPE DATABASE" / "TRUNCATE NOW" confirmations), but talks to
 * /api/admin/vault-wipe/* instead of /api/superAdmin/wipe/* so it
 * works from a pure vault session, with no dependency on the regular
 * super-admin session/cookie. On top of the typed confirmation, both
 * "Schedule wipe" and "Truncate now" require a fresh emailed step-up
 * code (VaultCodeConfirmModal) — a hijacked or left-open vault tab
 * still can't wipe the database on its own.
 *
 * DATA FLOW:
 * 1. On mount and every 30s, GET /api/admin/vault-wipe — shows either
 *    the "Wipe Database" button (no active request) or a live
 *    countdown card with Truncate Now / Cancel buttons
 * 2. "Wipe Database" -> choose backup option, type "WIPE DATABASE" ->
 *    Confirm opens VaultCodeConfirmModal -> POST /api/admin/vault-wipe
 *    with { backupOption, confirmationText, code }
 * 3. "Truncate Now" -> type "TRUNCATE NOW" -> Confirm opens
 *    VaultCodeConfirmModal -> POST /api/admin/vault-wipe/truncate-now
 *    with { confirmationText, code }
 * 4. "Cancel scheduled wipe" -> DELETE /api/admin/vault-wipe (no
 *    step-up code — cancelling only ever makes the outcome safer)
 * 5. Once time remaining reaches 2 hours, VaultWipeGraceModal (mounted
 *    by RecoveryClient.jsx) takes over as the final checkpoint — this
 *    component keeps showing the same countdown card underneath it.
 * 6. VaultActivityLogSection (mounted below the button/countdown card)
 *    shows the vault's own audit trail — every wipe scheduled/
 *    truncated/cancelled, lockdown ended, code sent/verified, etc. —
 *    pulled from SecurityLog via its own vault-session-only route.
 *
 * TOASTS: showToast is passed down as a prop from RecoveryClient.jsx,
 * which already owns the single toast stack for the recovery page.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "@/components/superAdmin/WipeDatabaseSection.css";
import "./VaultDangerZoneSection.css";
import "./RotateVaultUrlSection.css";
import VaultCodeConfirmModal from "./VaultCodeConfirmModal";
import VaultActivityLogSection from "./VaultActivityLogSection";
import RotateVaultUrlSection from "./RotateVaultUrlSection";

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    throw new Error(
      response.ok
        ? "The server sent back an unexpected response. Please try again."
        : `The server returned an error (${response.status}). Please try again.`
    );
  }
}

const POLL_INTERVAL_MS = 30 * 1000;
const REQUIRED_CONFIRMATION_TEXT = "WIPE DATABASE";
const REQUIRED_TRUNCATE_NOW_TEXT = "TRUNCATE NOW";

/** Formats whole milliseconds remaining as "Hh Mm" for the countdown card. */
function formatRemaining(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export default function VaultDangerZoneSection({ showToast }) {
  const [activeRequest, setActiveRequest] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [backupOption, setBackupOption] = useState("with_backup");
  const [confirmationText, setConfirmationText] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [isTruncateNowModalOpen, setIsTruncateNowModalOpen] = useState(false);
  const [truncateNowConfirmationText, setTruncateNowConfirmationText] = useState("");

  // Which step-up code modal (if any) is currently open, and what it
  // should do once the owner supplies a valid code.
  const [pendingStepUpAction, setPendingStepUpAction] = useState(null); // "schedule" | "truncate" | null
  const pollIntervalRef = useRef(null);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/vault-wipe");
      const result = await response.json();
      setActiveRequest(result?.data ?? null);
    } catch {
      // Best-effort — the next poll retries.
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
    setIsModalOpen(false);
  }

  /**
   * handleTypedConfirmationDone
   * Fires once the owner has typed "WIPE DATABASE" and clicked
   * Confirm on the intent modal — moves to the step-up code modal
   * rather than submitting immediately, since scheduling a wipe is a
   * two-factor action here (typed text + fresh emailed code).
   */
  function handleTypedConfirmationDone() {
    setIsModalOpen(false);
    setPendingStepUpAction("schedule");
  }

  /**
   * handleScheduleWithCode
   * Called by VaultCodeConfirmModal once the owner submits a valid
   * step-up code. Only now does the actual schedule request go out.
   */
  async function handleScheduleWithCode(code) {
    try {
      const response = await fetch("/api/admin/vault-wipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupOption, confirmationText, code }),
      });
      const result = await parseJsonResponse(response);

      if (!result.success) {
        showToast(result.message || "Failed to schedule the wipe.", "error");
        return;
      }

      showToast("✓ " + result.message, "success");
      setPendingStepUpAction(null);
      checkStatus();
    } catch (error) {
      showToast(error.message || "We couldn't reach the server. Check your connection and try again.", "error");
    }
  }

  /**
   * handleCancelWipe
   * Cancels the currently scheduled wipe. No step-up code required —
   * cancelling only ever makes the outcome safer, same reasoning as
   * "End Lockdown" not requiring one.
   */
  async function handleCancelWipe() {
    setIsCancelling(true);
    try {
      const response = await fetch("/api/admin/vault-wipe", { method: "DELETE" });
      const result = await parseJsonResponse(response);

      if (!result.success) {
        showToast(result.message || "Failed to cancel the wipe.", "error");
        setIsCancelling(false);
        return;
      }

      showToast("✓ Scheduled wipe cancelled.", "success");
      setActiveRequest(null);
      setIsCancelling(false);
    } catch (error) {
      showToast(error.message || "We couldn't reach the server. Check your connection and try again.", "error");
      setIsCancelling(false);
    }
  }

  function openTruncateNowModal() {
    setTruncateNowConfirmationText("");
    setIsTruncateNowModalOpen(true);
  }

  function closeTruncateNowModal() {
    setIsTruncateNowModalOpen(false);
  }

  function handleTruncateTypedConfirmationDone() {
    setIsTruncateNowModalOpen(false);
    setPendingStepUpAction("truncate");
  }

  /**
   * handleTruncateWithCode
   * Called by VaultCodeConfirmModal once the owner submits a valid
   * step-up code for the truncate-now bypass.
   */
  async function handleTruncateWithCode(code) {
    try {
      const response = await fetch("/api/admin/vault-wipe/truncate-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationText: truncateNowConfirmationText, code }),
      });
      const result = await parseJsonResponse(response);

      if (!result.success) {
        showToast(result.message || "Failed to truncate now.", "error");
        return;
      }

      const dispatchedInstantly = !result.message.startsWith("Couldn't trigger it instantly");
      showToast((dispatchedInstantly ? "✓ " : "⚠ ") + result.message, dispatchedInstantly ? "success" : "warning");
      setPendingStepUpAction(null);
      checkStatus();
    } catch (error) {
      showToast(error.message || "We couldn't reach the server. Check your connection and try again.", "error");
    }
  }

  const isConfirmationValid = confirmationText === REQUIRED_CONFIRMATION_TEXT;
  const isTruncateNowConfirmationValid = truncateNowConfirmationText === REQUIRED_TRUNCATE_NOW_TEXT;

  return (
    <section className="wipeDatabaseSection vaultDangerZoneSection">
      <div className="wipeDatabaseSectionHeader">
        <h2 className="wipeDatabaseSectionTitle">Danger Zone</h2>
        <p className="wipeDatabaseSectionSubtitle">
          Wiping the database is irreversible. A 24-hour grace period always applies, you'll get a final
          warning 2 hours before it runs, and every action here also requires a fresh code emailed to the
          vault owner — your vault session alone is never enough.
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
          <div className="wipeDatabaseActiveCardActions">
            <button
              type="button"
              className="wipeDatabaseTruncateNowButton"
              onClick={openTruncateNowModal}
              disabled={isCancelling}
            >
              Truncate Now
            </button>
            <button
              type="button"
              className="wipeDatabaseCancelButton"
              onClick={handleCancelWipe}
              disabled={isCancelling}
            >
              {isCancelling ? "Cancelling…" : "Cancel scheduled wipe"}
            </button>
          </div>
        </article>
      ) : (
        <button type="button" className="wipeDatabaseTriggerButton" onClick={openModal}>
          Wipe Database
        </button>
      )}

      <RotateVaultUrlSection showToast={showToast} />

      <VaultActivityLogSection showToast={showToast} />

      {isModalOpen && (
        <div className="wipeDatabaseModalBackdrop" role="dialog" aria-modal="true" aria-labelledby="vaultWipeModalTitle">
          <div className="wipeDatabaseModalDialog">
            <h2 id="vaultWipeModalTitle" className="wipeDatabaseModalTitle">
              Schedule a database wipe?
            </h2>
            <p className="wipeDatabaseModalDescription">
              This permanently erases all operational data. It will not run for 24 hours, and you'll get one final
              chance to cancel 2 hours before it executes. After typing the confirmation below, you'll also need to
              enter a fresh code emailed to the vault owner.
            </p>

            <fieldset className="wipeDatabaseModalOptions">
              <legend>Backup option</legend>
              <label className="wipeDatabaseModalOption">
                <input
                  type="radio"
                  name="vaultBackupOption"
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
                  name="vaultBackupOption"
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

            <label className="wipeDatabaseModalConfirmLabel" htmlFor="vaultWipeConfirmationText">
              Type <strong>{REQUIRED_CONFIRMATION_TEXT}</strong> to enable the confirm button
            </label>
            <input
              id="vaultWipeConfirmationText"
              type="text"
              className="wipeDatabaseModalConfirmInput"
              value={confirmationText}
              onChange={(event) => setConfirmationText(event.target.value)}
              autoComplete="off"
              autoFocus
            />

            <div className="wipeDatabaseModalActions">
              <button type="button" className="wipeDatabaseModalButtonNeutral" onClick={closeModal}>
                Cancel
              </button>
              <button
                type="button"
                className="wipeDatabaseModalButtonDestructive"
                onClick={handleTypedConfirmationDone}
                disabled={!isConfirmationValid}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {isTruncateNowModalOpen && (
        <div
          className="wipeDatabaseModalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vaultTruncateNowModalTitle"
        >
          <div className="wipeDatabaseModalDialog">
            <h2 id="vaultTruncateNowModalTitle" className="wipeDatabaseModalTitle">
              Bypass the grace period and truncate now?
            </h2>
            <p className="wipeDatabaseModalDescription">
              This skips the remaining wait entirely — {activeRequest?.backupOption === "with_backup"
                ? "a backup will still be taken first, then"
                : "no backup will be taken and"}{" "}
              the database will be truncated within about a minute. This cannot be undone or cancelled once it
              starts. After typing the confirmation below, you'll also need to enter a fresh emailed code.
            </p>

            <label className="wipeDatabaseModalConfirmLabel" htmlFor="vaultTruncateNowConfirmationText">
              Type <strong>{REQUIRED_TRUNCATE_NOW_TEXT}</strong> to enable the confirm button
            </label>
            <input
              id="vaultTruncateNowConfirmationText"
              type="text"
              className="wipeDatabaseModalConfirmInput"
              value={truncateNowConfirmationText}
              onChange={(event) => setTruncateNowConfirmationText(event.target.value)}
              autoComplete="off"
              autoFocus
            />

            <div className="wipeDatabaseModalActions">
              <button type="button" className="wipeDatabaseModalButtonNeutral" onClick={closeTruncateNowModal}>
                Cancel
              </button>
              <button
                type="button"
                className="wipeDatabaseModalButtonDestructive"
                onClick={handleTruncateTypedConfirmationDone}
                disabled={!isTruncateNowConfirmationValid}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingStepUpAction === "schedule" && (
        <VaultCodeConfirmModal
          title="Confirm Database Wipe"
          description="Enter the fresh verification code just emailed to you to schedule this wipe."
          confirmLabel="Schedule Wipe"
          requestCodeEndpoint="/api/admin/vault-wipe/request-code"
          onConfirm={handleScheduleWithCode}
          onCancel={() => setPendingStepUpAction(null)}
        />
      )}

      {pendingStepUpAction === "truncate" && (
        <VaultCodeConfirmModal
          title="Confirm Immediate Truncate"
          description="Enter the fresh verification code just emailed to you to truncate the database now."
          confirmLabel="Truncate Now"
          requestCodeEndpoint="/api/admin/vault-wipe/request-code"
          onConfirm={handleTruncateWithCode}
          onCancel={() => setPendingStepUpAction(null)}
        />
      )}
    </section>
  );
}
