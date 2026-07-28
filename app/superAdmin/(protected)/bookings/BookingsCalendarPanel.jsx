/**
 * FILE: app/superAdmin/(protected)/bookings/BookingsCalendarPanel.jsx
 * ROLE: Super-admin only — rendered inside the parent Bookings page,
 * itself already protected by middleware.js + requireSuperAdmin()
 *
 * PURPOSE:
 * Second of the two Bookings page panels — a month-grid calendar of
 * every CONFIRMED booking's occupied dates, following the same visual
 * pattern guests see on app/visitor/booking/RoomAvailabilityCalendar.jsx
 * (Available / Booked legend, month nav), but for admins: clicking a
 * booked day opens that day's booking(s) for full edit or delete,
 * instead of picking a new reservation.
 *
 * DATA FLOW:
 * 1. Receives the same already-fetched `bookings` array as the list panel
 * 2. Expands each CONFIRMED booking into the calendar date(s) it
 *    occupies (overnight ranges are inclusive of check-in, exclusive of
 *    check-out — same convention as the public /api/bookings/dates route)
 * 3. Clicking an occupied day calls onDayClick(bookingsOnThatDay) — the
 *    parent page owns opening the edit modal, this panel only builds
 *    the date -> booking(s) map and renders the grid
 */
"use client";

import { useMemo, useState } from "react";

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

/**
 * expandBookingDates
 * Returns every date key a single confirmed booking occupies.
 * Overnight: check-in (inclusive) through check-out (exclusive) — the
 * checkout day itself is free for the next guest. Day Tour / Night
 * Tour: a single same-day date (checkInDate === checkOutDate).
 */
function expandBookingDates(booking) {
  const checkIn = new Date(booking.checkInDate);
  const checkOut = new Date(booking.checkOutDate);

  if (booking.bookingType !== "overnight") {
    return [toDateKey(checkIn)];
  }

  const keys = [];
  const cursor = new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate());
  const end = new Date(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate());
  while (cursor < end) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export default function BookingsCalendarPanel({ bookings, onDayClick }) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  // Maps "YYYY-MM-DD" -> array of confirmed bookings occupying that day.
  // Cancelled bookings never occupy a date on this calendar — same rule
  // the public site's /api/bookings/dates route already follows.
  const bookingsByDate = useMemo(() => {
    const map = new Map();
    for (const booking of bookings) {
      if (booking.status !== "confirmed") continue;
      for (const dateKey of expandBookingDates(booking)) {
        if (!map.has(dateKey)) map.set(dateKey, []);
        map.get(dateKey).push(booking);
      }
    }
    return map;
  }, [bookings]);

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

  function goToMonth(offset) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <div className="bookingsPanel">
      <div className="bookingsPanelHeader">
        <h2 className="bookingsPanelTitle">Booking Calendar</h2>
      </div>

      <div className="bookingsCalendar">
        <div className="bookingsCalendarHeader">
          <button type="button" className="bookingsCalendarNavButton" onClick={() => goToMonth(-1)} aria-label="Previous month">
            ← Prev
          </button>
          <span className="bookingsCalendarMonthLabel">
            {MONTH_LABELS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
          </span>
          <button type="button" className="bookingsCalendarNavButton" onClick={() => goToMonth(1)} aria-label="Next month">
            Next →
          </button>
        </div>

        <div className="bookingsCalendarGrid">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="bookingsCalendarWeekday">{label}</span>
          ))}
          {calendarDays.map((date, index) => {
            if (!date) return <span key={`blank-${index}`} />;

            const dateKey = toDateKey(date);
            const dayBookings = bookingsByDate.get(dateKey);
            const isBooked = Boolean(dayBookings?.length);

            return (
              <button
                key={dateKey}
                type="button"
                className={`bookingsCalendarDay${isBooked ? " bookingsCalendarDay--booked" : ""}`}
                disabled={!isBooked}
                onClick={() => isBooked && onDayClick(dayBookings)}
                aria-label={`${dateKey}${isBooked ? ` — ${dayBookings.length} booking(s), click to view` : ""}`}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        <div className="bookingsCalendarLegend">
          <span><i className="bookingsCalendarLegendDot bookingsCalendarLegendDot--available" /> Available</span>
          <span><i className="bookingsCalendarLegendDot bookingsCalendarLegendDot--booked" /> Booked (click to manage)</span>
        </div>
      </div>
    </div>
  );
}
