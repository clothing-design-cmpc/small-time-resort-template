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
 * 3. Overnight bookings use RoomAvailabilityCalendar's range picker, but
 *    a single click now auto-completes the range using the SAME night
 *    count as the original stay — matching HowToBookSection's one-tap
 *    ease of use, instead of always requiring a second manual click
 *    just to re-enable Confirm (see handleSelectRange's own comment for
 *    why the pre-filled initial range made that second click necessary
 *    before this fix). A night-count mismatch or an auto-complete
 *    conflict is still caught client-side (disables Confirm + shows a
 *    hint) before ever hitting the server's authoritative same-check
 * 4. Day Tour / Night Tour bookings force single-day selection — every
 *    click sets both checkIn and checkOut to that one day
 * 5. Confirm -> POST /api/bookings/manage/reschedule -> onRescheduled()
 *    on success, closing back out to ManageBookingWidget's reset
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import RoomAvailabilityCalendar from "@/app/visitor/booking/RoomAvailabilityCalendar";
import "./ManageBookingWidget.css";

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(checkInKey, checkOutKey) {
  const checkIn = new Date(`${checkInKey}T00:00:00`);
  const checkOut = new Date(`${checkOutKey}T00:00:00`);
  return Math.round((checkOut - checkIn) / 86400000);
}

function addDaysKey(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return toDateKey(new Date(year, month - 1, day + days));
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

  const unavailableSet = useMemo(() => new Set(unavailableDates), [unavailableDates]);

  // Day Tour / Night Tour: every click is a single-day pick — ignore
  // RoomAvailabilityCalendar's range-completion logic and just set
  // both dates to whichever day was clicked.
  //
  // Overnight: RoomAvailabilityCalendar reports newCheckOut === "" the
  // moment a click starts a FRESH range (see its own handleDayClick —
  // this fires on literally the first click here too, since the modal
  // opens with a full range already pre-filled from the existing
  // booking, which the calendar treats as "a range is already picked,
  // so this click starts over"). Previously that meant Confirm went
  // straight from enabled (unclicked, pre-filled) to disabled the
  // instant the guest touched the calendar at all, needing a full
  // second click just to get back to a valid, enabled state — reading
  // exactly like "you have to click 2 dates before Confirm works."
  // HowToBookSection's own calendar never has this problem because it
  // only ever needs ONE tapped date to enable its Continue button.
  // To match that same one-tap responsiveness here, a fresh single
  // click now auto-completes the range using the SAME night count as
  // the original stay (the one thing reschedule already requires
  // anyway — see nightsMismatch below), so Confirm re-enables
  // immediately without a second click in the common case. If that
  // auto-computed checkout lands on a conflicting date, it's left
  // blank instead — the guest can still complete the range manually
  // with a second click, exactly as before.
  function handleSelectRange(newCheckIn, newCheckOut) {
    if (!isOvernight) {
      setSelectedCheckIn(newCheckIn);
      setSelectedCheckOut(newCheckIn);
      setErrorMessage(null);
      return;
    }

    if (newCheckOut === "") {
      const autoCheckOut = addDaysKey(newCheckIn, originalNights);
      // Check every night between the new check-in and the auto
      // checkout for a conflict — same "no unavailable date inside the
      // range" guard RoomAvailabilityCalendar itself applies when a
      // guest completes a range manually.
      let cursor = newCheckIn;
      let hasConflict = false;
      while (cursor < autoCheckOut) {
        if (unavailableSet.has(cursor)) {
          hasConflict = true;
          break;
        }
        cursor = addDaysKey(cursor, 1);
      }
      setSelectedCheckIn(newCheckIn);
      setSelectedCheckOut(hasConflict ? "" : autoCheckOut);
    } else {
      setSelectedCheckIn(newCheckIn);
      setSelectedCheckOut(newCheckOut);
    }
    setErrorMessage(null);
  }

  const selectedNights = selectedCheckIn && selectedCheckOut ? daysBetween(selectedCheckIn, selectedCheckOut) : null;
  const nightsMismatch = isOvernight && selectedNights !== null && selectedNights !== originalNights;
  // Auto-complete (see handleSelectRange above) hit a conflict and left
  // checkout blank — distinct from nightsMismatch, which only applies
  // once both ends of a range are actually set.
  const needsManualCheckout = isOvernight && Boolean(selectedCheckIn) && !selectedCheckOut;
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
        {needsManualCheckout && (
          <p className="manageBookingError" role="alert">
            We couldn't fit {originalNights} consecutive night(s) starting here — tap an end date to complete a different range.
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
