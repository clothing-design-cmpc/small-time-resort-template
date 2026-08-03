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
 *    room allowOvernightStay allowDayTour allowNightTour checkoutNotice
 *    onSelectType onClose /> once the visitor has picked a room for a
 *    single selected date. No pricing is shown on this step — every
 *    package's price depends on the room/rule matched further into the
 *    flow, not on the type choice made here. checkoutNotice (optional)
 *    is a plain-English heads-up shown at the top of this modal when
 *    the selected date is the checkout day of an existing overnight
 *    stay — e.g. "The previous guests check out at 11:00 this day,
 *    so Day Tour may not be available." Makes the visitor aware of the
 *    existing booking BEFORE they pick a type, instead of only finding
 *    out from an error after filling out the whole form.
 * 2. Tapping an option calls onSelectType(bookingType) — the caller
 *    (HowToBookSection.handleTourTypeSelected) is responsible for the
 *    actual navigation, this component only ever reports the choice
 *
 * PROMO INDICATION — promoEntries:
 * Array of { discountPercent, appliesTo } for whichever Promo Dates
 * (super-admin Booking Rules Section 5b) are active on THIS single
 * selected date — passed straight through from HowToBookSection's
 * promoMap. Each option card checks its own value against every
 * entry's appliesTo ("all" always matches) and, if any match, shows a
 * "X% OFF" badge — so the visitor sees exactly which of these three
 * choices the discount actually covers before picking one, instead of
 * only finding out once pricing is computed on the next screen.
 */
"use client";

import { useEffect } from "react";
import { formatTime12Hour } from "@/utils/formatTime";
import "./TourSelectionModal.css";

const OPTIONS = [
  {
    value: "overnight",
    label: "Overnight Stay",
    description: "Keep the room you just picked for the night.",
    startTimeKey: "checkInTime",
    endTimeKey: "checkOutTime",
  },
  {
    value: "day_tour",
    label: "Day Tour",
    description: "A same-day visit — no overnight stay.",
    startTimeKey: "dayTourStartTime",
    endTimeKey: "dayTourEndTime",
  },
  {
    value: "night_tour",
    label: "Night Tour",
    description: "An evening visit — no overnight stay.",
    startTimeKey: "nightTourStartTime",
    endTimeKey: "nightTourEndTime",
  },
];

/**
 * promoForOption
 * Finds the best-matching promo entry (highest %) for a given option
 * value out of every promo active on the selected date — an entry
 * matches when its appliesTo is "all" or equals this option's own
 * value. Returns null when nothing matches (no badge shown).
 */
function promoForOption(promoEntries, optionValue) {
  const matches = (promoEntries ?? []).filter(
    (entry) => entry.appliesTo === "all" || entry.appliesTo === optionValue
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, entry) => (entry.discountPercent > best.discountPercent ? entry : best));
}

export default function TourSelectionModal({
  isOpen,
  checkInDate,
  room,
  allowOvernightStay,
  allowDayTour,
  allowNightTour,
  checkoutNotice,
  timeWindows,
  promoEntries,
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

        {checkoutNotice && (
          <p className="tourSelectionCheckoutNotice" role="status">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {checkoutNotice}
          </p>
        )}

        {availableOptions.length === 0 ? (
          <div className="tourSelectionEmptyState">
            <p>No booking type is available for this date right now.</p>
            <p className="tourSelectionEmptyHint">Please go back and try a different date.</p>
          </div>
        ) : (
          <div className="tourSelectionGrid">
            {availableOptions.map((option) => {
              // Each option's own start/end "HH:mm" straight off the
              // active rule(s), formatted for display — never shown if
              // the rule fetch hasn't resolved yet or the field is
              // genuinely missing, so a still-loading state never
              // flashes a broken "undefined – undefined" range.
              const startTime = timeWindows?.[option.startTimeKey];
              const endTime = timeWindows?.[option.endTimeKey];
              const promo = promoForOption(promoEntries, option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  className="tourSelectionCard"
                  onClick={() => onSelectType(option.value)}
                >
                  {promo && (
                    <span className="tourSelectionCardPromoBadge">🎉 {promo.discountPercent}% OFF</span>
                  )}
                  <p className="tourSelectionCardName">{option.label}</p>
                  <p className="tourSelectionCardDescription">{option.description}</p>
                  {startTime && endTime && (
                    <p className="tourSelectionCardTimeRange">
                      {formatTime12Hour(startTime)} – {formatTime12Hour(endTime)}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
