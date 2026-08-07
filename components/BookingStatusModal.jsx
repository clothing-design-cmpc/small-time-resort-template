/**
 * FILE: components/BookingStatusModal.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Before this file existed, the "who's holding this date + live DP
 * Countdown" banner only ever appeared inside RoomSelectionModal.jsx —
 * which a visitor can only reach for a date that's still OPEN or
 * HALF-booked (components/sections/HowToBookSection.jsx's
 * handleDayClick early-returns on a FULLY booked day, so Step 2 never
 * opens for one). A single-room resort's Overnight booking marks the
 * whole date fully booked, so its countdown was structurally
 * unreachable — nothing wrong with the countdown itself, there was
 * just no door left open to see it.
 *
 * This modal is that door: tapping a fully-booked day now opens this
 * READ-ONLY popup instead of doing nothing. No room grid, no
 * selection, no "Continue" — purely informational, reusing the exact
 * same existing-bookings banner markup/classes and the same
 * DPCountdown/InfoTooltipIcon pieces (components/shared/
 * BookingCountdownPieces.jsx) RoomSelectionModal.jsx already uses, so
 * a pending booking's live countdown now shows for EVERY booking type
 * (Overnight included), not only Day/Night Tour partial conflicts.
 *
 * DATA FLOW:
 * 1. HowToBookSection's handleDayClick, on a fully-booked day, sets
 *    statusModalDate to that day's "YYYY-MM-DD" key instead of
 *    returning early
 * 2. useExistingBookingsOnDate(date, date) fetches the same
 *    /api/bookings/existing-on-date payload RoomSelectionModal uses
 * 3. Renders the same guestName / status badge / live DPCountdown row
 *    per booking found; "Close" or Escape clears statusModalDate
 */
"use client";

import { useEffect } from "react";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import { useExistingBookingsOnDate } from "@/hooks/useExistingBookingsOnDate";
import { DPCountdown, InfoTooltipIcon } from "@/components/shared/BookingCountdownPieces";
import "@/components/RoomSelectionModal.css";
import "./BookingStatusModal.css";

const BOOKING_TYPE_LABELS = {
  overnight: "Overnight",
  day_tour: "Day Tour",
  night_tour: "Night Tour",
};

/**
 * BookingStatusModal
 * @param {string|null} date - "YYYY-MM-DD" of the tapped fully-booked
 *   day, or null when the modal should be closed
 * @param {() => void} onClose
 */
export default function BookingStatusModal({ date, onClose }) {
  const isOpen = Boolean(date);

  // Same hook RoomSelectionModal.jsx uses — same-day range (a fully
  // booked day is queried as checkin === checkout, one calendar cell).
  const { existingBookings, isLoading } = useExistingBookingsOnDate(
    isOpen ? date : null,
    isOpen ? date : null
  );

  // Close on Escape — same keyboard-accessibility pattern every other
  // modal in this project follows.
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="bookingStatusBackdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Booking status for ${date}`}
      onClick={onClose}
    >
      <div className="bookingStatusDialog" onClick={(event) => event.stopPropagation()}>
        <div className="bookingStatusHeader">
          <div>
            <span className="roomSelectionEyebrow">Booking Status</span>
            <h2 className="roomSelectionTitle bookingStatusTitle">{date}</h2>
          </div>
          <button type="button" className="roomSelectionCloseButton" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {isLoading && <p className="bookingStatusHint">Checking this date…</p>}

        {!isLoading && existingBookings.length === 0 && (
          // Rare (a day can only land here via isBooked/isFullyTourBookedDay,
          // which both come from the same underlying data this hook
          // reads) — kept as a safety net rather than assumed impossible.
          <p className="bookingStatusHint">No active bookings found for this date.</p>
        )}

        {!isLoading && existingBookings.length > 0 && (
          <div className="roomSelectionExistingBookings bookingStatusExistingBookings">
            <p className="roomSelectionExistingBookingsLabel">
              {existingBookings.length === 1
                ? "This date is held by:"
                : `This date is held by ${existingBookings.length} bookings:`}
            </p>
            {existingBookings.map((existingBooking, index) => (
              <div key={index} className="roomSelectionExistingBookingRow">
                <span className="roomSelectionExistingBookingName">{existingBooking.guestName}</span>
                <span className="roomSelectionExistingBookingType">
                  {BOOKING_TYPE_LABELS[existingBooking.bookingType] ?? existingBooking.bookingType}
                </span>
                <StatusBadge status={existingBooking.status} />
                {existingBooking.status === "pending" && existingBooking.pendingExpiresAt && (
                  existingBooking.pendingHoldBreached ? (
                    <InfoTooltipIcon text="Awaiting resort confirmation — this booking's scheduled time has passed." />
                  ) : (
                    <>
                      <DPCountdown pendingExpiresAt={existingBooking.pendingExpiresAt} />
                      <InfoTooltipIcon text="Waiting for DP & Bank Transfer confirmation." />
                    </>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
