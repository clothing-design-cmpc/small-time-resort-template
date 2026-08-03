/**
 * FILE: app/superAdmin/(protected)/content/rooms/[roomId]/availability/AvailabilityCalendarClient.jsx
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * Renders the Room Availability Calendar sub-page: a month grid where
 * the admin clicks a date to toggle it available/blackout, bulk
 * actions (block this week, block next 2 weeks, clear all blocks),
 * and a read-only list of this room's upcoming confirmed bookings.
 *
 * DATA FLOW:
 * 1. useBlackoutDates() fetches every blackout range across all rooms;
 *    this page filters to just this room's ranges client-side (Rule
 *    "No-Rewrite" — reuses the existing, working, shared hook/API
 *    instead of adding a room-scoped endpoint)
 * 2. Clicking an available day creates a single-day BlackoutDate;
 *    clicking a blacked-out day deletes whichever blackout range
 *    covers it
 * 3. Bulk actions create/remove ranges the same way, just spanning
 *    more days at once
 */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useBlackoutDates } from "@/hooks/useBlackoutDates";
import { useToast } from "@/app/superAdmin/shared/useToast";
import ToastStack from "@/app/superAdmin/shared/ToastStack";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import "../../Rooms.css";
import "./AvailabilityCalendar.css";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Expands every booking/blackout range for this room into a lookup
 *  from date key -> the source record, so the calendar grid can
 *  color each cell and blackout clicks know which record to delete. */
function buildDateLookup(ranges, inclusiveEnd) {
  const lookup = new Map();
  for (const range of ranges) {
    const cursor = new Date(range.startDate);
    const stop = new Date(range.endDate);
    while (inclusiveEnd ? cursor <= stop : cursor < stop) {
      lookup.set(toDateKey(cursor), range);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return lookup;
}

export default function AvailabilityCalendarClient({ roomId, roomName, upcomingBookings }) {
  const { blackoutDates, isLoading, createBlackoutDate, deleteBlackoutDate } = useBlackoutDates();
  const { toasts, showToast, dismissToast } = useToast();

  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [isSavingDate, setIsSavingDate] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);

  const roomBlackoutDates = useMemo(
    () => blackoutDates.filter((entry) => entry.roomId === roomId),
    [blackoutDates, roomId]
  );

  const blackoutLookup = useMemo(() => buildDateLookup(roomBlackoutDates, true), [roomBlackoutDates]);
  const bookingLookup = useMemo(() => buildDateLookup(upcomingBookings, false), [upcomingBookings]);

  /**
   * handleDayClick
   * Booked days are never toggleable from here (bookings are managed
   * via the Bookings page, not this calendar). Available days create a
   * single-day blackout; already-blacked days remove whichever range
   * covers them.
   */
  async function handleDayClick(dateKey) {
    if (bookingLookup.has(dateKey)) return;

    setIsSavingDate(true);
    try {
      const existingBlackout = blackoutLookup.get(dateKey);
      if (existingBlackout) {
        await deleteBlackoutDate(existingBlackout.id);
        showToast("✓ Date reopened for booking.", "success");
      } else {
        await createBlackoutDate({ roomId, startDate: dateKey, endDate: dateKey, reason: "Custom" });
        showToast("✓ Date blocked.", "success");
      }
    } catch {
      showToast("✕ We couldn't update that date. Please try again.", "error");
    } finally {
      setIsSavingDate(false);
    }
  }

  /**
   * handleBulkBlock
   * Blocks a range of consecutive days starting today as one blackout
   * entry, for the "Block This Week" / "Block Next 2 Weeks" shortcuts.
   */
  async function handleBulkBlock(numberOfDays, label) {
    setIsSavingDate(true);
    try {
      const today = new Date();
      const endDate = addDays(today, numberOfDays - 1);
      await createBlackoutDate({
        roomId,
        startDate: toDateKey(today),
        endDate: toDateKey(endDate),
        reason: "Custom",
      });
      showToast(`✓ ${label} blocked.`, "success");
    } catch {
      showToast("✕ We couldn't block those dates. Please try again.", "error");
    } finally {
      setIsSavingDate(false);
    }
  }

  async function handleClearAllBlocks() {
    setIsSavingDate(true);
    try {
      for (const entry of roomBlackoutDates) {
        // eslint-disable-next-line no-await-in-loop -- deletes must not race each other against the same room
        await deleteBlackoutDate(entry.id);
      }
      showToast("✓ All blocks cleared for this room.", "success");
    } catch {
      showToast("✕ We couldn't clear all blocks. Please try again.", "error");
    } finally {
      setIsSavingDate(false);
      setShowClearAllConfirm(false);
    }
  }

  // --- Build the visible month's grid cells, padded to full weeks ---
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();

  const cells = [];
  for (let i = 0; i < leadingBlanks; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));

  const monthLabel = visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <section className="roomsSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="roomsHeaderRow">
        <div>
          <span className="roomsEyebrow">Content Management</span>
          <h1 className="roomsTitle">{roomName} — Availability</h1>
        </div>
        <Link href={`/superAdmin/content/rooms/${roomId}`} className="roomsRowActionButton">
          ← Back to Room
        </Link>
      </div>

      <div className="availabilityBulkActionsRow">
        <button type="button" className="roomsRowActionButton" disabled={isSavingDate} onClick={() => handleBulkBlock(7, "This week")}>
          Block This Week
        </button>
        <button type="button" className="roomsRowActionButton" disabled={isSavingDate} onClick={() => handleBulkBlock(14, "Next 2 weeks")}>
          Block Next 2 Weeks
        </button>
        <button
          type="button"
          className="roomsRowActionButton roomsRowActionButton--destructive"
          disabled={isSavingDate || roomBlackoutDates.length === 0}
          onClick={() => setShowClearAllConfirm(true)}
        >
          Clear All Blocks
        </button>
      </div>

      <div className="availabilityCalendarCard">
        <div className="availabilityCalendarNavRow">
          <button
            type="button"
            className="roomsRowActionButton"
            onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}
            aria-label="Previous month"
          >
            ← Prev
          </button>
          <h2 className="availabilityCalendarMonthLabel">{monthLabel}</h2>
          <button
            type="button"
            className="roomsRowActionButton"
            onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}
            aria-label="Next month"
          >
            Next →
          </button>
        </div>

        <div className="availabilityCalendarWeekdayRow">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="availabilityCalendarWeekdayLabel">{label}</span>
          ))}
        </div>

        <div className="availabilityCalendarGrid">
          {cells.map((date, index) => {
            if (!date) return <span key={`blank-${index}`} className="availabilityCalendarCell availabilityCalendarCell--blank" />;

            const dateKey = toDateKey(date);
            const isBooked = bookingLookup.has(dateKey);
            const isBlacked = blackoutLookup.has(dateKey);
            const cellState = isBooked ? "booked" : isBlacked ? "blocked" : "available";

            return (
              <button
                key={dateKey}
                type="button"
                className={`availabilityCalendarCell availabilityCalendarCell--${cellState}`}
                disabled={isBooked || isLoading || isSavingDate}
                onClick={() => handleDayClick(dateKey)}
                title={isBooked ? "Booked — manage from the Bookings page" : isBlacked ? "Blocked — click to reopen" : "Available — click to block"}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        <div className="availabilityCalendarLegend">
          <span className="availabilityLegendItem"><span className="availabilityLegendSwatch availabilityLegendSwatch--available" />Available</span>
          <span className="availabilityLegendItem"><span className="availabilityLegendSwatch availabilityLegendSwatch--blocked" />Blocked</span>
          <span className="availabilityLegendItem"><span className="availabilityLegendSwatch availabilityLegendSwatch--booked" />Booked</span>
        </div>
      </div>

      <div className="availabilityBookingsPanel">
        <h2 className="availabilityBookingsTitle">Upcoming Bookings</h2>
        {upcomingBookings.length === 0 ? (
          <p className="roomFormMutedText">No upcoming bookings for this room.</p>
        ) : (
          <ul className="availabilityBookingsList">
            {upcomingBookings.map((booking) => (
              <li key={booking.id} className="availabilityBookingsRow">
                <span className="availabilityBookingsGuest">
                  {booking.guestName}
                  {booking.status === "pending" && <span className="availabilityBookingsPendingBadge">Pending</span>}
                </span>
                <span className="availabilityBookingsDates">{booking.checkInDate} → {booking.checkOutDate}</span>
                <span className="availabilityBookingsGuests">{booking.numberOfGuests} guest{booking.numberOfGuests === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmationModal
        isOpen={showClearAllConfirm}
        title="Clear All Blocks?"
        description={`Are you sure you want to reopen every blocked date for "${roomName}"? This cannot be undone.`}
        confirmLabel="Clear All Blocks"
        onConfirm={handleClearAllBlocks}
        onCancel={() => setShowClearAllConfirm(false)}
      />
    </section>
  );
}
