/**
 * FILE: components/shared/BookingProgressWidget.jsx
 * ROLE: Visitor — public, rendered on every visitor page via app/visitor/layout.jsx
 *
 * PURPOSE:
 * Floating "Booking Progress" icon fixed directly above ManageBookingWidget's
 * Cancellation button (same right edge, stacked higher). Read-only status
 * check for a guest who already has a reference code and just wants to know
 * where their booking stands — no cancel/rebook actions live here, those
 * stay on ManageBookingWidget. Two stages only:
 *   - pending   -> waiting for DP + receipt and the owner's bank-transfer
 *                  confirmation, with a live-ticking countdown to the
 *                  hold's expiry (see app/api/cron/booking-expiry/route.js
 *                  for the auto-cancellation + email that fires once it
 *                  actually passes)
 *   - confirmed -> booked
 *
 * DATA FLOW:
 * 1. Click the floating icon -> opens this modal in "code" step
 * 2. Guest submits their reference code -> POST /api/bookings/progress
 * 3. Found -> "result" step, showing the matching stage message; a
 *    pending result also starts a per-second countdown from the
 *    booking's real pendingExpiresAt, and silently re-checks once it
 *    hits 0 so the guest sees the post-expiry state without retyping
 * 4. Not found / cancelled / expired -> inline error on the code step
 */
"use client";

import { useEffect, useRef, useState } from "react";
import "./BookingProgressWidget.css";

const STEP_CODE = "code";
const STEP_RESULT = "result";

export default function BookingProgressWidget() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(STEP_CODE);
  const [referenceCode, setReferenceCode] = useState("");
  const [progress, setProgress] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  // Ticks down every second while the result step shows a pending
  // booking with a known pendingExpiresAt — null until that first
  // computes, so the hint line doesn't flash "0s" before the first tick.
  const [secondsRemaining, setSecondsRemaining] = useState(null);

  const codeInputRef = useRef(null);
  // Guards the "hold just expired" auto-refresh below from firing more
  // than once per result — the countdown reaching 0 is a single event,
  // not something to re-trigger on every render while it sits at 0.
  const hasAutoRefetchedRef = useRef(false);

  // Autofocus the reference code field the moment the modal opens (Rule 34.3)
  useEffect(() => {
    if (isModalOpen && step === STEP_CODE) {
      codeInputRef.current?.focus();
    }
  }, [isModalOpen, step]);

  /**
   * Live countdown for a pending booking's DP window. Recomputes from
   * the real pendingExpiresAt timestamp every second (not a decrementing
   * local counter) so the number is always accurate even if the tab was
   * backgrounded and timers were throttled. When it reaches 0, silently
   * re-runs the lookup once to pick up the real post-expiry status
   * (owner may confirm right at the wire, or the cron sweep — Rule 38's
   * app/api/cron/booking-expiry/route.js — may have already flipped it).
   */
  useEffect(() => {
    if (step !== STEP_RESULT || progress?.status !== "pending" || !progress?.pendingExpiresAt) {
      setSecondsRemaining(null);
      return;
    }

    hasAutoRefetchedRef.current = false;
    const targetTime = new Date(progress.pendingExpiresAt).getTime();

    function tick() {
      const remaining = Math.max(0, Math.round((targetTime - Date.now()) / 1000));
      setSecondsRemaining(remaining);

      if (remaining === 0 && !hasAutoRefetchedRef.current) {
        hasAutoRefetchedRef.current = true;
        refetchProgress();
      }
    }

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [step, progress?.status, progress?.pendingExpiresAt]);

  /**
   * refetchProgress
   * Silent re-check against the same reference code already on screen —
   * used once the live countdown hits 0, so the guest sees the real
   * "auto-cancelled" state without having to manually click "Check
   * another code" and retype it. Never shows a loading/error state of
   * its own; if it fails, the stale pending card just stays as-is until
   * the guest checks manually.
   */
  async function refetchProgress() {
    try {
      const response = await fetch("/api/bookings/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceCode: progress?.referenceCode }),
      });
      const result = await response.json();
      if (result.success && result.data.found) {
        setProgress(result.data);
      } else if (result.success && !result.data.found) {
        // Cron already expired it — same "no longer active" copy the
        // API returns for a manually-typed expired code.
        setStep(STEP_CODE);
        setErrorMessage(result.message);
      }
    } catch {
      // Silent — the guest still has the last-known pending state on
      // screen and can always retry with "Check another code".
    }
  }

  /**
   * formatCountdown
   * Renders whole seconds as "Xh Ym Zs" (omitting a leading zero unit,
   * e.g. "45m 12s" once under an hour) for the live countdown hint.
   */
  function formatCountdown(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours > 0 ? `${hours}h` : null, `${minutes}m`, `${seconds}s`].filter(Boolean).join(" ");
  }

  function resetAndClose() {
    setIsModalOpen(false);
    setStep(STEP_CODE);
    setReferenceCode("");
    setProgress(null);
    setErrorMessage(null);
  }

  function handleOpen() {
    setIsModalOpen(true);
  }

  function handleCheckAnother() {
    setStep(STEP_CODE);
    setReferenceCode("");
    setProgress(null);
    setErrorMessage(null);
  }

  /* Looks up the reference code's current stage, moving to the result step on success */
  async function handleLookupSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return; // Never allow double-submit
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/bookings/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceCode }),
      });
      const result = await response.json();

      if (!result.success) {
        setErrorMessage(result.message);
        return;
      }
      if (!result.data.found) {
        setErrorMessage(result.message);
        return;
      }

      setProgress(result.data);
      setStep(STEP_RESULT);
    } catch {
      setErrorMessage("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {/* Floating icon — stacked directly above ManageBookingWidget's Cancellation button, min 44x44 tap target */}
      <button
        type="button"
        className="bookingProgressButton"
        onClick={handleOpen}
        aria-label="Check your booking progress"
        title="Booking Progress"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 14" />
        </svg>
        <span className="bookingProgressTooltip" role="tooltip">Booking Progress</span>
      </button>

      {isModalOpen && (
        <div className="bookingProgressBackdrop" role="presentation" onClick={resetAndClose}>
          <div
            className="bookingProgressModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bookingProgressTitle"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="bookingProgressCloseButton" onClick={resetAndClose} aria-label="Close">
              ×
            </button>

            {step === STEP_CODE && (
              <form onSubmit={handleLookupSubmit} noValidate>
                <h2 id="bookingProgressTitle" className="bookingProgressTitle">Check Booking Progress</h2>
                <p className="bookingProgressSubtitle">
                  Enter your reference code to see where your booking currently stands.
                </p>

                <label className="bookingProgressField" htmlFor="bookingProgressCode">
                  Reference Code <span aria-hidden="true">*</span>
                  <input
                    ref={codeInputRef}
                    id="bookingProgressCode"
                    type="text"
                    placeholder="VAR-20260728-H24KT"
                    value={referenceCode}
                    onChange={(event) => setReferenceCode(event.target.value.toUpperCase())}
                    required
                    minLength={1}
                    maxLength={40}
                  />
                </label>

                {errorMessage && <p className="bookingProgressError" role="alert">{errorMessage}</p>}

                <button type="submit" className="bookingProgressSubmitButton" disabled={isSubmitting}>
                  {isSubmitting ? "Checking…" : "Check Progress"}
                </button>
              </form>
            )}

            {step === STEP_RESULT && progress && (
              <div>
                <h2 id="bookingProgressTitle" className="bookingProgressTitle">Hi, {progress.guestFirstName}!</h2>
                <p className="bookingProgressReferenceLine">Reference code: {progress.referenceCode}</p>

                {progress.status === "pending" && (
                  <div className="bookingProgressStage bookingProgressStage--pending">
                    <span className="bookingProgressStageLabel">⏳ Pending</span>
                    <p className="bookingProgressStageText">
                      Waiting for your DP and receipt, and the owner&apos;s bank-transfer confirmation.
                    </p>
                    {secondsRemaining !== null ? (
                      <p className="bookingProgressStageHint">
                        {secondsRemaining > 0
                          ? <>
                              <span className="bookingProgressCountdown">{formatCountdown(secondsRemaining)}</span>
                              {" "}left to send your DP before these dates are released, counting from when you created this booking.
                            </>
                          : "The DP window just closed — checking your booking's current status…"}
                      </p>
                    ) : (
                      progress.hoursRemaining !== null && (
                        <p className="bookingProgressStageHint">
                          {progress.hoursRemaining > 0
                            ? `${progress.hoursRemaining} hour${progress.hoursRemaining === 1 ? "" : "s"} left to send your DP before these dates are released, counting from when you created this booking.`
                            : "The DP window has passed — please contact us if you still want these dates."}
                        </p>
                      )
                    )}
                  </div>
                )}

                {progress.status === "confirmed" && (
                  <div className="bookingProgressStage bookingProgressStage--confirmed">
                    <span className="bookingProgressStageLabel">✅ Booked</span>
                    <p className="bookingProgressStageText">
                      Your booking is confirmed. We&apos;ll see you on your check-in date.
                    </p>
                  </div>
                )}

                <button type="button" className="bookingProgressNeutralButton" onClick={handleCheckAnother}>
                  Check another code
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
