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
 *                  confirmation, with hours remaining before the hold expires
 *   - confirmed -> booked
 *
 * DATA FLOW:
 * 1. Click the floating icon -> opens this modal in "code" step
 * 2. Guest submits their reference code -> POST /api/bookings/progress
 * 3. Found -> "result" step, showing the matching stage message
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

  const codeInputRef = useRef(null);

  // Autofocus the reference code field the moment the modal opens (Rule 34.3)
  useEffect(() => {
    if (isModalOpen && step === STEP_CODE) {
      codeInputRef.current?.focus();
    }
  }, [isModalOpen, step]);

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
                    {progress.hoursRemaining !== null && (
                      <p className="bookingProgressStageHint">
                        {progress.hoursRemaining > 0
                          ? `${progress.hoursRemaining} hour${progress.hoursRemaining === 1 ? "" : "s"} left to send your DP before these dates are released, counting from when you created this booking.`
                          : "The DP window has passed — please contact us if you still want these dates."}
                      </p>
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
