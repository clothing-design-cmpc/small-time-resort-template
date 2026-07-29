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

const PESO = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });

const BOOKING_TYPE_LABELS = {
  overnight: "Overnight Stay",
  day_tour: "Day Tour",
  night_tour: "Night Tour",
};

const STEP_CODE = "code";
const STEP_SUMMARY = "summary";
const STEP_CONFIRM_CANCEL = "confirmCancel";
const STEP_CANCELLED = "cancelled";
const STEP_REBOOKED = "rebooked";

export default function ManageBookingWidget() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(STEP_CODE);
  const [referenceCode, setReferenceCode] = useState("");
  const [booking, setBooking] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isRebookModalOpen, setIsRebookModalOpen] = useState(false);
  // Populated from POST /api/bookings/manage/reschedule's response so the
  // STEP_REBOOKED success screen can show the guest their new dates and a
  // link to the updated (REBOOK-watermarked) invoice PDF.
  const [rebookedInfo, setRebookedInfo] = useState(null);

  const codeInputRef = useRef(null);
  // Guards the auto-download effect below from firing a second time on a
  // re-render (StrictMode double-invoke, or the parent re-rendering while
  // this step is still showing) — the browser should only ever trigger
  // one download per successful reschedule.
  const hasAutoDownloadedRef = useRef(false);

  // Autofocus the reference code field the moment the modal opens (Rule 34.3)
  useEffect(() => {
    if (isModalOpen && step === STEP_CODE) {
      codeInputRef.current?.focus();
    }
  }, [isModalOpen, step]);

  /**
   * Auto-download the updated invoice the moment the rebooked success
   * screen shows — the guest asked not to have to click anything.
   * Triggered via a hidden, programmatically-clicked <a>: the invoice
   * route responds with Content-Disposition: attachment, so a normal
   * anchor click downloads the file without ever navigating the page
   * away, and without the popup-blocker risk of window.open().
   */
  useEffect(() => {
    if (step !== STEP_REBOOKED || !rebookedInfo?.invoiceUrl || hasAutoDownloadedRef.current) return;
    hasAutoDownloadedRef.current = true;

    const downloadLink = document.createElement("a");
    downloadLink.href = rebookedInfo.invoiceUrl;
    downloadLink.rel = "noopener";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }, [step, rebookedInfo]);

  function resetAndClose() {
    setIsModalOpen(false);
    setStep(STEP_CODE);
    setReferenceCode("");
    setBooking(null);
    setErrorMessage(null);
  }

  /**
   * handleCancelledClose
   * Closing the "Booking cancelled" success screen reloads the page —
   * not just resetAndClose()'s state reset — so the calendars elsewhere
   * on the page (HowToBookSection, BookedDatesSection) show the newly
   * freed date immediately. Both fetch their booked-dates data via a
   * client-side hook on mount only, so nothing else would prompt them
   * to refetch after this widget's own cancel request succeeds.
   */
  function handleCancelledClose() {
    window.location.reload();
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

  function handleRescheduled(data) {
    setIsRebookModalOpen(false);
    hasAutoDownloadedRef.current = false;
    setRebookedInfo(data ?? null);
    setIsModalOpen(true);
    setStep(STEP_REBOOKED);
  }

  /**
   * handleRebookedClose
   * Same reasoning as handleCancelledClose above — reloads the page so
   * the homepage calendars (HowToBookSection, BookedDatesSection) pick
   * up the moved dates immediately instead of showing stale
   * availability from their mount-only fetch.
   */
  function handleRebookedClose() {
    window.location.reload();
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
                  <dt>Package</dt>
                  <dd>{BOOKING_TYPE_LABELS[booking.bookingType] ?? booking.bookingType}</dd>

                  <dt>Room</dt>
                  <dd>{booking.roomName ?? "—"}{booking.roomBedType ? ` — ${booking.roomBedType} bed` : ""}</dd>

                  <dt>Check-in</dt>
                  <dd>{booking.checkInDate}{booking.checkInTime ? ` at ${booking.checkInTime}` : ""}</dd>

                  <dt>Check-out</dt>
                  <dd>{booking.checkOutDate}{booking.checkOutTime ? ` at ${booking.checkOutTime}` : ""}</dd>

                  <dt>Guests</dt>
                  <dd>{booking.numberOfGuests}</dd>

                  <dt>Included</dt>
                  <dd>
                    {booking.includedAmenities.length > 0
                      ? booking.includedAmenities.join(", ")
                      : "No additional amenities listed for this room."}
                  </dd>

                  <dt>Total</dt>
                  <dd>{PESO.format(booking.totalAmount)}</dd>

                  {booking.depositAmount > 0 && (
                    <>
                      <dt>Deposit due</dt>
                      <dd>{PESO.format(booking.depositAmount)}</dd>
                    </>
                  )}

                  {booking.notes && (
                    <>
                      <dt>Notes</dt>
                      <dd>{booking.notes}</dd>
                    </>
                  )}
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
                <button type="button" className="manageBookingSubmitButton" onClick={handleCancelledClose}>
                  Close
                </button>
              </div>
            )}

            {step === STEP_REBOOKED && rebookedInfo && (
              <div className="manageBookingSuccess">
                <p className="manageBookingSuccessTitle">Booking rebooked</p>
                <p className="manageBookingSuccessSubtitle">
                  Your updated invoice is downloading now. Your reference code stays the same.
                </p>

                {booking && (
                  <dl className="manageBookingSummary">
                    <dt>Reference code</dt>
                    <dd>{rebookedInfo.booking.referenceCode}</dd>

                    <dt>Package</dt>
                    <dd>{BOOKING_TYPE_LABELS[booking.bookingType] ?? booking.bookingType}</dd>

                    <dt>Room</dt>
                    <dd>{booking.roomName ?? "—"}{booking.roomBedType ? ` — ${booking.roomBedType} bed` : ""}</dd>

                    <dt>Check-in</dt>
                    <dd>{rebookedInfo.booking.checkInDate}{rebookedInfo.booking.checkInTime ? ` at ${rebookedInfo.booking.checkInTime}` : ""}</dd>

                    <dt>Check-out</dt>
                    <dd>{rebookedInfo.booking.checkOutDate}{rebookedInfo.booking.checkOutTime ? ` at ${rebookedInfo.booking.checkOutTime}` : ""}</dd>

                    <dt>Guests</dt>
                    <dd>{booking.numberOfGuests}</dd>

                    <dt>Included</dt>
                    <dd>
                      {booking.includedAmenities.length > 0
                        ? booking.includedAmenities.join(", ")
                        : "No additional amenities listed for this room."}
                    </dd>

                    <dt>Total</dt>
                    <dd>{PESO.format(booking.totalAmount)}</dd>

                    {booking.depositAmount > 0 && (
                      <>
                        <dt>Deposit due</dt>
                        <dd>{PESO.format(booking.depositAmount)}</dd>
                      </>
                    )}
                  </dl>
                )}

                {rebookedInfo.invoiceUrl && (
                  <p className="manageBookingRedownloadHint">
                    Download didn't start?{" "}
                    <a href={rebookedInfo.invoiceUrl} rel="noopener">Get the invoice here</a>.
                  </p>
                )}

                <button type="button" className="manageBookingSubmitButton" onClick={handleRebookedClose}>
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