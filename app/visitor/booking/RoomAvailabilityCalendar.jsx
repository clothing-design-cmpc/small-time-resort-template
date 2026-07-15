/**
 * FILE: app/visitor/booking/RoomAvailabilityCalendar.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Task 1 follow-up: the plain native <input type="date"> fields let a
 * guest pick a check-in/check-out date that's already booked or
 * blacked out by the super-admin, with no visual warning until the
 * quote preview comes back. This component shows the same
 * Available/Blocked/Booked calendar the super-admin already sees on
 * the Room Availability page, wired to unavailableDates from
 * useRoomAvailability(), and lets the guest click days directly to
 * fill in checkInDate/checkOutDate instead of guessing.
 *
 * DATA FLOW:
 * 1. Receives `unavailableDates` (from the room's /availability route)
 *    and the current checkInDate/checkOutDate from the parent form
 * 2. Clicking an available day: if no check-in is set (or both are
 *    already set), starts a new selection at that day; if a check-in
 *    is already set and the clicked day is later, completes the range
 * 3. Calls onSelectRange(checkInDate, checkOutDate) so the parent form
 *    (BookingFormClient) stays the single source of truth for the
 *    actual form values — this component never owns form state itself
 */
"use client";

import { useMemo, useState } from "react";
import "./RoomAvailabilityCalendar.css";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function RoomAvailabilityCalendar({ unavailableDates = [], checkInDate, checkOutDate, onSelectRange }) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const unavailableSet = useMemo(() => new Set(unavailableDates), [unavailableDates]);
  const todayKey = toDateKey(new Date());

  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day));
    }
    return cells;
  }, [visibleMonth]);

  function handleDayClick(dateKey) {
    if (unavailableSet.has(dateKey) || dateKey < todayKey) return; // never selectable

    // No range started yet, or a full range was already picked -> start fresh.
    if (!checkInDate || (checkInDate && checkOutDate)) {
      onSelectRange(dateKey, "");
      return;
    }

    // Check-in already set and this day is after it -> completes the range,
    // as long as nothing unavailable falls in between the two dates.
    if (dateKey > checkInDate) {
      const cursor = new Date(`${checkInDate}T00:00:00`);
      const stop = new Date(`${dateKey}T00:00:00`);
      let hasConflict = false;
      cursor.setDate(cursor.getDate() + 1);
      while (cursor < stop) {
        if (unavailableSet.has(toDateKey(cursor))) {
          hasConflict = true;
          break;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      onSelectRange(checkInDate, hasConflict ? "" : dateKey);
    } else {
      // Clicked an earlier day than the current check-in -> restart from there.
      onSelectRange(dateKey, "");
    }
  }

  function goToMonth(offset) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <div className="roomAvailabilityCalendar">
      <div className="roomAvailabilityCalendarHeader">
        <button type="button" onClick={() => goToMonth(-1)} aria-label="Previous month">← Prev</button>
        <span>{MONTH_LABELS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}</span>
        <button type="button" onClick={() => goToMonth(1)} aria-label="Next month">Next →</button>
      </div>

      <div className="roomAvailabilityCalendarGrid">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="roomAvailabilityCalendarWeekday">{label}</span>
        ))}
        {calendarDays.map((date, index) => {
          if (!date) return <span key={`blank-${index}`} />;

          const dateKey = toDateKey(date);
          const isPast = dateKey < todayKey;
          const isUnavailable = unavailableSet.has(dateKey);
          const isCheckIn = dateKey === checkInDate;
          const isCheckOut = dateKey === checkOutDate;
          const isInRange = checkInDate && checkOutDate && dateKey > checkInDate && dateKey < checkOutDate;

          let cellClass = "roomAvailabilityDay";
          if (isPast || isUnavailable) cellClass += " roomAvailabilityDay--disabled";
          if (isCheckIn || isCheckOut) cellClass += " roomAvailabilityDay--selected";
          else if (isInRange) cellClass += " roomAvailabilityDay--inRange";

          return (
            <button
              key={dateKey}
              type="button"
              className={cellClass}
              disabled={isPast || isUnavailable}
              onClick={() => handleDayClick(dateKey)}
              aria-label={`${dateKey}${isUnavailable ? " — unavailable" : ""}`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="roomAvailabilityCalendarLegend">
        <span><i className="roomAvailabilityLegendDot roomAvailabilityLegendDot--available" /> Available</span>
        <span><i className="roomAvailabilityLegendDot roomAvailabilityLegendDot--unavailable" /> Blocked / Booked</span>
        <span><i className="roomAvailabilityLegendDot roomAvailabilityLegendDot--selected" /> Your dates</span>
      </div>
    </div>
  );
}
