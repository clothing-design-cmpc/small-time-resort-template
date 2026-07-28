/**
 * FILE: app/superAdmin/(protected)/bookings/BookingsListPanel.jsx
 * ROLE: Super-admin only — rendered inside the parent Bookings page,
 * itself already protected by middleware.js + requireSuperAdmin()
 *
 * PURPOSE:
 * First of the two Bookings page panels — a filterable table of every
 * booking, ascending by check-in date (nearest upcoming stay first),
 * with a status filter (All / Confirmed / Cancelled) on top.
 *
 * DATA FLOW:
 * 1. Receives the already-fetched `bookings` array from the parent page
 * 2. Applies the locally-held statusFilter before rendering rows
 * 3. "Cancel booking" and "Edit" buttons call back up to the parent via
 *    onCancelClick / onEditClick — this panel owns no booking mutation
 *    logic itself, only the filter UI and the table markup
 */
"use client";

import { useMemo, useState } from "react";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(isoString) {
  return DATE_FORMATTER.format(new Date(isoString));
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function BookingsListPanel({ bookings, onCancelClick, onEditClick }) {
  const [statusFilter, setStatusFilter] = useState("all");

  // Bookings already arrive check-in-ascending from the API (Rule: nearest
  // upcoming stay first) — this only narrows by status, never re-sorts.
  const filteredBookings = useMemo(() => {
    if (statusFilter === "all") return bookings;
    return bookings.filter((booking) => booking.status === statusFilter);
  }, [bookings, statusFilter]);

  return (
    <div className="bookingsPanel">
      <div className="bookingsPanelHeader">
        <h2 className="bookingsPanelTitle">Upcoming & Past Bookings</h2>
        <div className="bookingsFilterGroup" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`bookingsFilterButton${statusFilter === filter.value ? " bookingsFilterButton--active" : ""}`}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {filteredBookings.length === 0 ? (
        <div className="bookingsEmptyState">
          <p className="bookingsEmptyTitle">No {statusFilter === "all" ? "" : statusFilter + " "}bookings.</p>
          <p className="bookingsEmptySubtitle">Reservations made by guests will show up here.</p>
        </div>
      ) : (
        <div className="bookingsTableWrap">
          <table className="bookingsTable">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Room</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredBookings.map((booking) => (
                <tr key={booking.id}>
                  <td>{booking.guestName}</td>
                  <td>{booking.room?.name ?? "—"}</td>
                  <td>{formatDate(booking.checkInDate)}</td>
                  <td>{formatDate(booking.checkOutDate)}</td>
                  <td>
                    <span className={`bookingsStatusBadge bookingsStatusBadge--${booking.status}`}>
                      {booking.status === "confirmed" ? "Confirmed" : "Cancelled"}
                    </span>
                  </td>
                  <td className="bookingsActionsCell">
                    <div className="bookingsRowActions">
                      <button
                        type="button"
                        className="bookingsEditButton"
                        onClick={() => onEditClick(booking)}
                      >
                        Edit
                      </button>
                      {booking.status === "confirmed" && (
                        <button
                          type="button"
                          className="bookingsCancelButton"
                          onClick={() => onCancelClick(booking)}
                        >
                          Cancel booking
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
