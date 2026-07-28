/**
 * FILE: components/shared/RebookCalendarModal.jsx
 * ROLE: Visitor — public, no auth required, opened by
 *       ManageBookingWidget's "Rebook (change dates)" action
 *
 * PURPOSE:
 * Lets a guest pick new dates for their existing booking, using the
 * same calendar component (RoomAvailabilityCalendar) the normal
 * booking flow already uses — so the visual language (Available /
 * Blocked / Your dates) is identical to what they saw when they first
 * booked. Same reference code, room, and stay length are kept; only
 * the calendar dates change (see app/api/bookings/manage/reschedule
 * for exactly what's validated/updated server-side and why).
 *
 * DATA FLOW:
 * 1. ManageBookingWidget passes the looked-up booking summary
 *    (referenceCode, bookingType, current checkIn/checkOutDate,
 *    roomId, roomName)
 * 2. On mount, fetches this room's unavailable dates via
 *    /api/rooms/{roomId}/availability?excludeReferenceCode=... — the
 *    exclude param keeps the guest's OWN current dates from showing
 *    as "unavailable" on their own reschedule calendar
 * 3. Overnight bookings use RoomAvailabilityCalendar's normal range
 *    picker, but a night-count mismatch against the original stay is
 *    caught client-side (disables Confirm + shows a hint) before ever
 *    hitting the server's authoritative same-check
 * 4. Day Tour / Night Tour bookings force single-day selection — every
 *    click sets both checkIn and checkOut to that one day
 * 5. Confirm -> POST /api/bookings/manage/reschedule -> onRescheduled()
 *    on success, closing back out to ManageBookingWidget's reset
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import RoomAvailabilityCalendar from "@/app/visitor/booking/RoomAvailabilityCalendar";
import "./ManageBookingWidget.css";

function daysBetween(checkInKey, checkOutKey) {
  const checkIn = new Date(`${checkInKey}T00:00:00`);
  const checkOut = new Date(`${checkOutKey}T00:00:00`);
  return Math.round((checkOut - checkIn) / 86400000);
}

export default function RebookCalendarModal({ booking, onClose, onRescheduled }) {
  const isOvernight = booking.bookingType === "overnight";
  const originalNights = useMemo(
    () => (isOvernight ? daysBetween(booking.checkInDate, booking.checkOutDate) : 0),
    [isOvernight, booking.checkInDate, booking.checkOutDate]
  );

  const [selectedCheckIn, setSelectedCheckIn] = useState(booking.checkInDate);
  const [selectedCheckOut, setSelectedCheckOut] = useState(booking.checkOutDate);
  const [unavailableDates, setUnavailableDates] = useState([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Loads this room's unavailable dates, excluding the guest's own
  // current booking so their existing dates don't show as blocked.
  useEffect(() => {
    let isCancelled = false;

    async function fetchAvailability() {
      setIsLoadingAvailability(true);
      try {
        const response = await fetch(
          `/api/rooms/${booking.roomId}/availability?excludeReferenceCode=${encodeURIComponent(booking.referenceCode)}`
        );
        const result = await response.json();
        if (!isCancelled && result.success) {
          setUnavailableDates(result.data.unavailableDates);
        }
      } catch {
        // Non-fatal — calendar just shows no unavailable dates; the
        // server-side overlap check in the reschedule route is the
        // real guard regardless.
      } finally {
        if (!isCancelled) setIsLoadingAvailability(false);
      }
    }

    fetchAvailability();
    return () => {
      isCancelled = true;
    };
  }, [booking.roomId, booking.referenceCode]);

  // Day Tour / Night Tour: every click is a single-day pick — ignore
  // RoomAvailabilityCalendar's range-completion logic and just set
  // both dates to whichever day was clicked.
  function handleSelectRange(newCheckIn, newCheckOut) {
    if (isOvernight) {
      setSelectedCheckIn(newCheckIn);
      setSelectedCheckOut(newCheckOut);
    } else {
      setSelectedCheckIn(newCheckIn);
      setSelectedCheckOut(newCheckIn);
    }
    setErrorMessage(null);
  }

  const selectedNights = selectedCheckIn && selectedCheckOut ? daysBetween(selectedCheckIn, selectedCheckOut) : null;
  const nightsMismatch = isOvernight && selectedNights !== null && selectedNights !== originalNights;
  const canConfirm = isOvernight
    ? Boolean(selectedCheckIn && selectedCheckOut && !nightsMismatch)
    : Boolean(selectedCheckIn);

  async function handleConfirm() {
    if (!canConfirm || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/bookings/manage/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceCode: booking.referenceCode,
          checkInDate: selectedCheckIn,
          checkOutDate: selectedCheckOut,
        }),
      });
      const result = await response.json();

      if (!result.success) {
        setErrorMessage(result.message);
        return;
      }
      onRescheduled();
    } catch {
      setErrorMessage("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="manageBookingBackdrop" role="presentation" onClick={onClose}>
      <div
        className="manageBookingModal rebookCalendarModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rebookCalendarTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="manageBookingCloseButton" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2 id="rebookCalendarTitle" className="manageBookingTitle">Pick New Dates</h2>
        <p className="manageBookingSubtitle">
          {isOvernight
            ? `Select ${originalNights} night(s) for ${booking.roomName ?? "your room"} — same length as your original stay.`
            : `Select a new date for ${booking.roomName ?? "your booking"}.`}
        </p>

        {isLoadingAvailability ? (
          <p className="manageBookingLoadingText">Loading available dates…</p>
        ) : (
          <RoomAvailabilityCalendar
            unavailableDates={unavailableDates}
            checkInDate={selectedCheckIn}
            checkOutDate={isOvernight ? selectedCheckOut : ""}
            onSelectRange={handleSelectRange}
          />
        )}

        {nightsMismatch && (
          <p className="manageBookingError" role="alert">
            Please select {originalNights} night(s) to match your original booking.
          </p>
        )}
        {errorMessage && <p className="manageBookingError" role="alert">{errorMessage}</p>}

        <div className="manageBookingActions">
          <button type="button" className="manageBookingNeutralButton" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="button" className="manageBookingSubmitButton" onClick={handleConfirm} disabled={!canConfirm || isSubmitting}>
            {isSubmitting ? "Saving…" : "Confirm New Dates"}
          </button>
        </div>
      </div>
    </div>
  );
}
