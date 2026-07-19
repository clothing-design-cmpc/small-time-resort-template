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
 *
 * TOASTS: this component does NOT own a useToast instance or render
 * its own <ToastStack> — it lives inside BackupLogsClient on the
 * Backups page, which already owns the single toast stack for that
 * page. showToast is passed down as a prop (Rule 22.4's sub-component
 * pattern). Two independent fixed-position ToastStacks used to be
 * mounted here AND in the parent at the same time, which put two
 * separate stacking contexts at the exact same top-center coordinates
 * — the visible cause of the garbled/overlapping banner on this page.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./WipeDatabaseSection.css";

/**
 * parseJsonResponse
 * Reads a fetch Response as JSON, but never lets a non-JSON body (an
 * HTML error page from a crashed route, a proxy error page, etc.)
 * masquerade as a network failure. Only an actual failed fetch() (the
 * request never reached/returned from the server at all) should ever
 * produce the "couldn't reach the server" message — a response that
 * arrived but wasn't parseable JSON is a server-side bug and gets its
 * own honest message instead.
 */
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

export default function WipeDatabaseSection({ showToast }) {
  const [activeRequest, setActiveRequest] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [backupOption, setBackupOption] = useState("with_backup");
  const [confirmationText, setConfirmationText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isTruncateNowModalOpen, setIsTruncateNowModalOpen] = useState(false);
  const [truncateNowConfirmationText, setTruncateNowConfirmationText] = useState("");
  const [isTruncatingNow, setIsTruncatingNow] = useState(false);
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
      const result = await parseJsonResponse(response);

      if (!result.success) {
        showToast(result.message || "Failed to schedule the wipe.", "error");
        setIsSubmitting(false);
        return;
      }

      showToast("✓ " + result.message, "success");
      setIsModalOpen(false);
      setIsSubmitting(false);
      checkStatus();
    } catch (error) {
      showToast(error.message || "We couldn't reach the server. Check your connection and try again.", "error");
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
    if (isTruncatingNow) return;
    setIsTruncateNowModalOpen(false);
  }

  /**
   * handleTruncateNow
   * Bypasses the remaining grace period on the active request and
   * runs the wipe immediately. Gated behind its own typed confirmation
   * ("TRUNCATE NOW"), separate from the one used to schedule the wipe
   * in the first place.
   *
   * On success, the server has ALREADY locked the whole site down and
   * cleared this admin's session cookie (see
   * app/api/superAdmin/wipe/truncate-now/route.js) before this
   * response even arrives — this admin is logged out server-side the
   * instant the request completes, not once the actual TRUNCATE
   * finishes on GitHub Actions. So instead of staying on this page,
   * jump straight to /maintenance rather than waiting for the next
   * status poll (up to 30s away) or next click to get caught by
   * proxy.js's lockdown redirect.
   */
  async function handleTruncateNow() {
    setIsTruncatingNow(true);
    try {
      const response = await fetch("/api/superAdmin/wipe/truncate-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationText: truncateNowConfirmationText }),
      });
      const result = await parseJsonResponse(response);

      if (!result.success) {
        showToast(result.message || "Failed to truncate now.", "error");
        setIsTruncatingNow(false);
        return;
      }

      // The site is already locked and this session is already signed
      // out server-side — leave immediately, no toast needed since
      // there's no page left here to see it on.
      window.location.href = "/maintenance";
    } catch (error) {
      showToast(error.message || "We couldn't reach the server. Check your connection and try again.", "error");
      setIsTruncatingNow(false);
    }
  }

  const isConfirmationValid = confirmationText === REQUIRED_CONFIRMATION_TEXT;
  const isTruncateNowConfirmationValid = truncateNowConfirmationText === REQUIRED_TRUNCATE_NOW_TEXT;

  return (
    <section className="wipeDatabaseSection">
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
      {isTruncateNowModalOpen && (
        <div
          className="wipeDatabaseModalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="truncateNowModalTitle"
        >
          <div className="wipeDatabaseModalDialog">
            <h2 id="truncateNowModalTitle" className="wipeDatabaseModalTitle">
              Bypass the grace period and truncate now?
            </h2>
            <p className="wipeDatabaseModalDescription">
              This skips the remaining wait entirely — {activeRequest?.backupOption === "with_backup"
                ? "a backup will still be taken first, then"
                : "no backup will be taken and"}{" "}
              the database will be truncated within about a minute. This cannot be undone or cancelled once it
              starts.
            </p>

            <label className="wipeDatabaseModalConfirmLabel" htmlFor="truncateNowConfirmationText">
              Type <strong>{REQUIRED_TRUNCATE_NOW_TEXT}</strong> to enable the confirm button
            </label>
            <input
              id="truncateNowConfirmationText"
              type="text"
              className="wipeDatabaseModalConfirmInput"
              value={truncateNowConfirmationText}
              onChange={(event) => setTruncateNowConfirmationText(event.target.value)}
              autoComplete="off"
              autoFocus
            />

            <div className="wipeDatabaseModalActions">
              <button
                type="button"
                className="wipeDatabaseModalButtonNeutral"
                onClick={closeTruncateNowModal}
                disabled={isTruncatingNow}
              >
                Cancel
              </button>
              <button
                type="button"
                className="wipeDatabaseModalButtonDestructive"
                onClick={handleTruncateNow}
                disabled={!isTruncateNowConfirmationValid || isTruncatingNow}
              >
                {isTruncatingNow ? "Truncating…" : "Truncate now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
