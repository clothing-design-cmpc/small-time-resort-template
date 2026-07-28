/**
 * FILE: components/shared/ManageBookingWidget.jsx
 * ROLE: Visitor — public, rendered on every visitor page via app/visitor/layout.jsx
 *
 * PURPOSE:
 * Floating "Manage My Booking" icon fixed above WalkInChatWidget's
 * callback button (same right edge, stacked higher). Lets a guest who
 * already has a reference code self-service either Cancel their
 * booking outright, or Rebook it onto new dates without needing to
 * call the resort — see app/api/bookings/manage/*.js for the backing
 * endpoints and their file headers for the exact rules each enforces.
 *
 * DATA FLOW:
 * 1. Click the floating icon -> opens this modal in "code" step
 * 2. Guest submits their reference code -> POST /api/bookings/manage/lookup
 * 3. Found + confirmed -> "summary" step, showing Rebook / Cancel
 * 4. Cancel -> inline confirm -> POST /api/bookings/manage/cancel -> "cancelled" step
 * 5. Rebook -> this modal closes, RebookCalendarModal opens with the
 *    looked-up booking's details (see that component for the actual
 *    date-picker flow and its own POST to /api/bookings/manage/reschedule)
 */
"use client";

import { useEffect, useRef, useState } from "react";
import RebookCalendarModal from "./RebookCalendarModal";
import "./ManageBookingWidget.css";

const STEP_CODE = "code";
const STEP_SUMMARY = "summary";
const STEP_CONFIRM_CANCEL = "confirmCancel";
const STEP_CANCELLED = "cancelled";

export default function ManageBookingWidget() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(STEP_CODE);
  const [referenceCode, setReferenceCode] = useState("");
  const [booking, setBooking] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isRebookModalOpen, setIsRebookModalOpen] = useState(false);

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
    setBooking(null);
    setErrorMessage(null);
  }

  function handleOpen() {
    setIsModalOpen(true);
  }

  /* Looks up the reference code the guest typed in, moving to the summary step on success */
  async function handleLookupSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return; // Never allow double-submit
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/bookings/manage/lookup", {
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

      setBooking(result.data.booking);
      setStep(STEP_SUMMARY);
    } catch {
      setErrorMessage("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  /* Confirms the cancellation the guest requested in the confirm step */
  async function handleConfirmCancel() {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/bookings/manage/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceCode: booking.referenceCode }),
      });
      const result = await response.json();

      if (!result.success) {
        setErrorMessage(result.message);
        setStep(STEP_SUMMARY);
        return;
      }
      setStep(STEP_CANCELLED);
    } catch {
      setErrorMessage("We couldn't reach the server. Check your connection and try again.");
      setStep(STEP_SUMMARY);
    } finally {
      setIsSubmitting(false);
    }
  }

  /* Hands off to RebookCalendarModal — this modal closes, that one opens with the same booking details */
  function handleRebookClick() {
    setIsModalOpen(false);
    setIsRebookModalOpen(true);
  }

  function handleRebookModalClose() {
    setIsRebookModalOpen(false);
    resetAndClose();
  }

  function handleRescheduled() {
    setIsRebookModalOpen(false);
    resetAndClose();
  }

  return (
    <>
      {/* Floating icon — stacked directly above WalkInChatWidget's button, min 44x44 tap target */}
      <button
        type="button"
        className="manageBookingButton"
        onClick={handleOpen}
        aria-label="Manage or cancel your booking"
        title="Cancellation"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="9" y1="15" x2="15" y2="19" />
          <line x1="15" y1="15" x2="9" y2="19" />
        </svg>
        <span className="manageBookingTooltip" role="tooltip">Cancellation</span>
      </button>

      {isModalOpen && (
        <div className="manageBookingBackdrop" role="presentation" onClick={resetAndClose}>
          <div
            className="manageBookingModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manageBookingTitle"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="manageBookingCloseButton" onClick={resetAndClose} aria-label="Close">
              ×
            </button>

            {step === STEP_CODE && (
              <form onSubmit={handleLookupSubmit} noValidate>
                <h2 id="manageBookingTitle" className="manageBookingTitle">Manage Your Booking</h2>
                <p className="manageBookingSubtitle">
                  Enter your reference code to rebook new dates or cancel your reservation.
                </p>

                <label className="manageBookingField" htmlFor="manageBookingCode">
                  Reference Code <span aria-hidden="true">*</span>
                  <input
                    ref={codeInputRef}
                    id="manageBookingCode"
                    type="text"
                    placeholder="VAR-20260728-H24KT"
                    value={referenceCode}
                    onChange={(event) => setReferenceCode(event.target.value.toUpperCase())}
                    required
                    minLength={1}
                    maxLength={40}
                  />
                </label>

                {errorMessage && <p className="manageBookingError" role="alert">{errorMessage}</p>}

                <button type="submit" className="manageBookingSubmitButton" disabled={isSubmitting}>
                  {isSubmitting ? "Looking up…" : "Find My Booking"}
                </button>
              </form>
            )}

            {step === STEP_SUMMARY && booking && (
              <div>
                <h2 id="manageBookingTitle" className="manageBookingTitle">Hi, {booking.guestFirstName}!</h2>
                <dl className="manageBookingSummary">
                  <dt>Room</dt>
                  <dd>{booking.roomName ?? "—"}</dd>
                  <dt>Check-in</dt>
                  <dd>{booking.checkInDate}</dd>
                  <dt>Check-out</dt>
                  <dd>{booking.checkOutDate}</dd>
                </dl>

                {errorMessage && <p className="manageBookingError" role="alert">{errorMessage}</p>}

                <div className="manageBookingActions">
                  <button type="button" className="manageBookingRebookButton" onClick={handleRebookClick}>
                    Rebook (change dates)
                  </button>
                  <button type="button" className="manageBookingCancelButton" onClick={() => setStep(STEP_CONFIRM_CANCEL)}>
                    Cancel booking
                  </button>
                </div>
              </div>
            )}

            {step === STEP_CONFIRM_CANCEL && booking && (
              <div>
                <h2 id="manageBookingTitle" className="manageBookingTitle">Cancel this booking?</h2>
                <p className="manageBookingSubtitle">
                  This frees up {booking.checkInDate} – {booking.checkOutDate} for other guests and cannot be undone.
                </p>

                {errorMessage && <p className="manageBookingError" role="alert">{errorMessage}</p>}

                <div className="manageBookingActions">
                  <button type="button" className="manageBookingNeutralButton" onClick={() => setStep(STEP_SUMMARY)} disabled={isSubmitting}>
                    Go back
                  </button>
                  <button type="button" className="manageBookingCancelButton" onClick={handleConfirmCancel} disabled={isSubmitting}>
                    {isSubmitting ? "Cancelling…" : "Yes, cancel it"}
                  </button>
                </div>
              </div>
            )}

            {step === STEP_CANCELLED && (
              <div className="manageBookingSuccess">
                <p className="manageBookingSuccessTitle">Booking cancelled</p>
                <p className="manageBookingSuccessSubtitle">
                  Your reservation has been cancelled and those dates are now free.
                </p>
                <button type="button" className="manageBookingSubmitButton" onClick={resetAndClose}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {isRebookModalOpen && booking && (
        <RebookCalendarModal
          booking={booking}
          onClose={handleRebookModalClose}
          onRescheduled={handleRescheduled}
        />
      )}
    </>
  );
}
