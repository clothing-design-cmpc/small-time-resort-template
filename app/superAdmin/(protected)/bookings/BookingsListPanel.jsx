/**
 * FILE: app/superAdmin/(protected)/bookings/BookingsListPanel.jsx
 * ROLE: Super-admin only — rendered inside the parent Bookings page,
 * itself already protected by middleware.js + requireSuperAdmin()
 *
 * PURPOSE:
 * First of the two Bookings page panels — a filterable table of every
 * booking, ascending by check-in date (nearest upcoming stay first),
 * with a status filter (All / Pending / Confirmed / Cancelled /
 * Expired) on top.
 *
 * DATA FLOW:
 * 1. Receives the already-fetched `bookings` array from the parent page
 * 2. Applies the locally-held statusFilter before rendering rows
 * 3. Clicking anywhere on a row (except its action buttons, which stop
 *    propagation) calls onRowClick, which opens BookingDetailsModal
 * 4. "Confirm booking", "Reject", "Cancel booking", and "Edit" buttons
 *    call back up to the parent via onConfirmClick / onCancelClick /
 *    onEditClick — this panel owns no booking mutation logic itself,
 *    only the filter UI and the table markup. "Reject" reuses the same
 *    onCancelClick callback as "Cancel booking" (both flip status to
 *    "cancelled" via the same PATCH route) — only the button label
 *    differs, since rejecting a pending request and cancelling a
 *    confirmed one are the same server-side action.
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

const STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  expired: "Expired",
};

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
];

export default function BookingsListPanel({ bookings, onRowClick, onConfirmClick, onCancelClick, onEditClick }) {
  // Defaults to "Pending" so a returning admin sees what needs their
  // attention first, instead of the full historical list.
  const [statusFilter, setStatusFilter] = useState("pending");

  // Bookings already arrive check-in-ascending from the API (Rule: nearest
  // upcoming stay first) — this only narrows by status, never re-sorts.
  const filteredBookings = useMemo(() => {
    if (statusFilter === "all") return bookings;
    return bookings.filter((booking) => booking.status === statusFilter);
  }, [bookings, statusFilter]);

  const pendingCount = useMemo(
    () => bookings.filter((booking) => booking.status === "pending").length,
    [bookings]
  );

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
              {filter.value === "pending" && pendingCount > 0 && (
                <span className="bookingsFilterBadge">{pendingCount}</span>
              )}
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
                <tr
                  key={booking.id}
                  className="bookingsRowClickable"
                  onClick={() => onRowClick(booking)}
                >
                  <td>{booking.guestName}</td>
                  <td>{booking.room?.name ?? "—"}</td>
                  <td>{formatDate(booking.checkInDate)}</td>
                  <td>{formatDate(booking.checkOutDate)}</td>
                  <td>
                    <span className={`bookingsStatusBadge bookingsStatusBadge--${booking.status}`}>
                      {STATUS_LABELS[booking.status] ?? booking.status}
                    </span>
                    {/* Short-window (capped) hold whose scheduled start already
                        passed without confirmation — app/api/cron/booking-expiry/
                        route.js deliberately never auto-cancels these, so it
                        needs to stay visible here until a super-admin acts. */}
                    {booking.status === "pending" && booking.pendingHoldBreachedAt && (
                      <span className="bookingsStatusBadge bookingsStatusBadge--breached">
                        Breached — needs review
                      </span>
                    )}
                  </td>
                  <td className="bookingsActionsCell" onClick={(event) => event.stopPropagation()}>
                    <div className="bookingsRowActions">
                      <button
                        type="button"
                        className="bookingsEditButton"
                        onClick={() => onEditClick(booking)}
                      >
                        Edit
                      </button>
                      {booking.status === "pending" && (
                        <>
                          <button
                            type="button"
                            className="bookingsConfirmButton"
                            onClick={() => onConfirmClick(booking)}
                          >
                            Confirm booking
                          </button>
                          <button
                            type="button"
                            className="bookingsCancelButton"
                            onClick={() => onCancelClick(booking)}
                          >
                            Reject
                          </button>
                        </>
                      )}
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
