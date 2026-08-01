/**
 * FILE: components/RoomSelectionModal.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Opens once components/sections/HowToBookSection.jsx has confirmed a
 * matching BookingRule exists for the visitor's selected dates. Lists
 * every room with no overlapping booking or blackout for that range
 * (hooks/useAvailableRooms.js -> GET /api/rooms/available) and lets
 * the visitor pick one. Selecting a room hands the room back to the
 * caller, which then routes into the read-only reservation summary
 * (app/visitor/booking/ReservationSummaryClient.jsx) with the room,
 * dates, and matched rule all pre-filled.
 *
 * DATA FLOW:
 * 1. HowToBookSection renders <RoomSelectionModal isOpen checkInDate
 *    checkOutDate onSelectRoom onClose />  once its own rule check
 *    passes
 * 2. useAvailableRooms fetches on mount (and whenever the dates change)
 * 3. Tapping a room card calls onSelectRoom(room) — the caller is
 *    responsible for the actual navigation, this component only ever
 *    reports the choice
 */
"use client";

import { useEffect } from "react";
import StatusBadge from "@/components/superAdmin/StatusBadge";
import { useExistingBookingsOnDate } from "@/hooks/useExistingBookingsOnDate";
import "./RoomSelectionModal.css";

const PESO = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });

const BOOKING_TYPE_LABELS = {
  overnight: "Overnight",
  day_tour: "Day Tour",
  night_tour: "Night Tour",
};

export default function RoomSelectionModal({ isOpen, checkInDate, checkOutDate, rooms, isLoading, error, onSelectRoom, onClose }) {
  // Existing pending/confirmed booking(s) on the same date(s) — shown
  // as a small context banner above the room grid so a second guest
  // browsing the same date can see who else already has a booking
  // there (name, status, tour type), before picking their own room.
  // Only fetches while the modal is actually open, on real dates.
  const { existingBookings } = useExistingBookingsOnDate(
    isOpen ? checkInDate : null,
    isOpen ? checkOutDate : null
  );

  // Close on Escape — same keyboard-accessibility expectation as every
  // other modal in this project (Rule 33.3 focus-visible spirit).
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
    <div className="roomSelectionBackdrop" role="dialog" aria-modal="true" aria-label="Choose a room">
      <div className="roomSelectionDialog">
        <div className="roomSelectionHeader">
          <div>
            <span className="roomSelectionEyebrow">Step 2</span>
            <h2 className="roomSelectionTitle">Choose Your Villa</h2>
            <p className="roomSelectionSubtitle">
              Available rooms for {checkInDate}{checkOutDate && checkOutDate !== checkInDate ? ` – ${checkOutDate}` : ""}
            </p>
          </div>
          <button type="button" className="roomSelectionCloseButton" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {existingBookings.length > 0 && (
          <div className="roomSelectionExistingBookings">
            <p className="roomSelectionExistingBookingsLabel">
              {existingBookings.length === 1
                ? "There's already a booking on this date:"
                : `There are already ${existingBookings.length} bookings on this date:`}
            </p>
            {existingBookings.map((existingBooking, index) => (
              <div key={index} className="roomSelectionExistingBookingRow">
                <span className="roomSelectionExistingBookingName">{existingBooking.guestName}</span>
                <span className="roomSelectionExistingBookingType">
                  {BOOKING_TYPE_LABELS[existingBooking.bookingType] ?? existingBooking.bookingType}
                </span>
                <StatusBadge status={existingBooking.status} />
              </div>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="roomSelectionGrid">
            {[1, 2, 3].map((key) => (
              <div key={key} className="roomSelectionCardSkeleton skeletonBlock" aria-label="Loading room" />
            ))}
          </div>
        )}

        {!isLoading && error && (
          <p className="roomSelectionErrorMessage" role="alert">{error}</p>
        )}

        {!isLoading && !error && rooms.length === 0 && (
          <div className="roomSelectionEmptyState">
            <p>No rooms are available for these dates.</p>
            <p className="roomSelectionEmptyHint">Please go back and try a different date range.</p>
          </div>
        )}

        {!isLoading && !error && rooms.length > 0 && (
          <div className="roomSelectionGrid">
            {rooms.map((room) => (
              <button key={room.id} type="button" className="roomSelectionCard" onClick={() => onSelectRoom(room)}>
                {room.imageUrl ? (
                  <div className="roomSelectionCardImageWrapper">
                    <img src={room.imageUrl} alt={room.name} className="roomSelectionCardImage" draggable="false" />
                  </div>
                ) : (
                  <div className="roomSelectionCardImageWrapper roomSelectionCardImagePlaceholder" />
                )}
                <div className="roomSelectionCardBody">
                  <p className="roomSelectionCardName">{room.name}</p>
                  <p className="roomSelectionCardMeta">{room.bedType} · up to {room.capacity} guests</p>
                  {room.amenities.length > 0 && (
                    <p className="roomSelectionCardAmenities">
                      {room.amenities.map((amenity) => amenity.name).join(" · ")}
                    </p>
                  )}
                  <p className="roomSelectionCardPrice">{PESO.format(room.pricePerNight)}/night</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
