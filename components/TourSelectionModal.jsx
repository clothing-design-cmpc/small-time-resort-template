/**
 * FILE: components/TourSelectionModal.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Opens after RoomSelectionModal ONLY when the visitor selected exactly
 * ONE date on the home calendar (components/sections/HowToBookSection.jsx).
 * A single date is ambiguous — it could become an Overnight stay (1
 * night), a Day Tour, or a Night Tour — so this modal lets the visitor
 * pick the actual booking type before routing into the booking flow.
 * When 2+ dates were selected, this modal is skipped entirely — that
 * selection can only ever be an Overnight stay, so HowToBookSection
 * routes straight through after the room is picked.
 *
 * DATA FLOW:
 * 1. HowToBookSection renders <TourSelectionModal isOpen checkInDate
 *    room allowOvernightStay allowDayTour allowNightTour
 *    dayTourPricePerGuest nightTourPricePerGuest onSelectType onClose />
 *    once the visitor has picked a room for a single selected date
 * 2. Tapping an option calls onSelectType(bookingType) — the caller
 *    (HowToBookSection.handleTourTypeSelected) is responsible for the
 *    actual navigation, this component only ever reports the choice
 */
"use client";

import { useEffect } from "react";
import "./TourSelectionModal.css";

const PESO = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });

const OPTIONS = [
  {
    value: "overnight",
    label: "Overnight Stay",
    description: "Keep the villa you just picked for the night.",
  },
  {
    value: "day_tour",
    label: "Day Tour",
    description: "A same-day visit — no overnight stay.",
  },
  {
    value: "night_tour",
    label: "Night Tour",
    description: "An evening visit — no overnight stay.",
  },
];

export default function TourSelectionModal({
  isOpen,
  checkInDate,
  room,
  allowOvernightStay,
  allowDayTour,
  allowNightTour,
  dayTourPricePerGuest,
  nightTourPricePerGuest,
  onSelectType,
  onClose,
}) {
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

  // Only show the types the currently active rule actually allows for
  // this single selected date — never a type the backend has nothing
  // to price.
  const availableOptions = OPTIONS.filter((option) => {
    if (option.value === "overnight") return allowOvernightStay;
    if (option.value === "day_tour") return allowDayTour;
    if (option.value === "night_tour") return allowNightTour;
    return false;
  });

  return (
    <div className="tourSelectionBackdrop" role="dialog" aria-modal="true" aria-label="Choose your booking type">
      <div className="tourSelectionDialog">
        <div className="tourSelectionHeader">
          <div>
            <span className="tourSelectionEyebrow">Step 3</span>
            <h2 className="tourSelectionTitle">How Would You Like to Visit?</h2>
            <p className="tourSelectionSubtitle">
              {checkInDate}{room ? ` · ${room.name}` : ""}
            </p>
          </div>
          <button type="button" className="tourSelectionCloseButton" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {availableOptions.length === 0 ? (
          <div className="tourSelectionEmptyState">
            <p>No booking type is available for this date right now.</p>
            <p className="tourSelectionEmptyHint">Please go back and try a different date.</p>
          </div>
        ) : (
          <div className="tourSelectionGrid">
            {availableOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className="tourSelectionCard"
                onClick={() => onSelectType(option.value)}
              >
                <p className="tourSelectionCardName">{option.label}</p>
                <p className="tourSelectionCardDescription">{option.description}</p>
                {option.value === "day_tour" && dayTourPricePerGuest > 0 && (
                  <p className="tourSelectionCardPrice">{PESO.format(dayTourPricePerGuest)}/guest</p>
                )}
                {option.value === "night_tour" && nightTourPricePerGuest > 0 && (
                  <p className="tourSelectionCardPrice">{PESO.format(nightTourPricePerGuest)}/guest</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}