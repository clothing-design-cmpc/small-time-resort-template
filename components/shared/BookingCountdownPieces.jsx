/**
 * FILE: components/shared/BookingCountdownPieces.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * The live DP Countdown pieces (formatCountdown / DPCountdown /
 * InfoTooltipIcon) originally lived only inside components/
 * RoomSelectionModal.jsx. Pulled out here so BookingStatusModal.jsx
 * (the read-only "who's holding this date" popup opened from a FULLY
 * booked calendar day) can show the exact same live-ticking countdown
 * without a second, drifting copy of the same three functions.
 *
 * Both callers still rely on RoomSelectionModal.css for the actual
 * class names used below (.roomSelectionExistingBookingCountdown,
 * .roomSelectionInfoIconWrapper, .roomSelectionInfoTooltip) — import
 * that stylesheet wherever these are used.
 */
"use client";

import { useEffect, useState } from "react";

/**
 * formatCountdown
 * Turns a millisecond duration into "Hh Mm Ss" (e.g. "3h 42m 09s"),
 * dropping to "0h 00m 00s" once expired rather than going negative.
 */
export function formatCountdown(msRemaining) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

/**
 * DPCountdown
 * Ticks down, once per second, the time remaining until a "pending"
 * booking's DP Countdown hold (Booking.pendingExpiresAt) expires. Ticks
 * client-side only off the server-provided timestamp — never assumes
 * the visitor's own clock is correct on its own, just uses it to
 * animate between real timestamp comparisons.
 */
export function DPCountdown({ pendingExpiresAt }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, []);

  const msRemaining = new Date(pendingExpiresAt).getTime() - now;

  return <span className="roomSelectionExistingBookingCountdown">{formatCountdown(msRemaining)}</span>;
}

/**
 * InfoTooltipIcon
 * Small "!" icon that reveals a text tooltip on hover/focus, explaining
 * why a "Pending" booking is still holding its dates — never emoji
 * (Rule 17.3), plain inline SVG so it matches every other icon in the
 * project. Focusable (tabIndex 0) so keyboard users can reach the
 * tooltip too, not just mouse hover.
 */
export function InfoTooltipIcon({ text }) {
  return (
    <span className="roomSelectionInfoIconWrapper" tabIndex={0}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="13" />
        <circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
      </svg>
      <span className="roomSelectionInfoTooltip" role="tooltip">{text}</span>
    </span>
  );
}
