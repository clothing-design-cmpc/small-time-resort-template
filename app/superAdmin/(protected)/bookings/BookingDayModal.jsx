/**
 * FILE: app/superAdmin/(protected)/bookings/BookingDayModal.jsx
 * ROLE: Super-admin only — rendered from the parent Bookings page
 *
 * PURPOSE:
 * Opens when an admin clicks a booked day on BookingsCalendarPanel.
 * Usually shows exactly one booking, but a single date can carry two
 * (a Day Tour and a Night Tour on the same date don't block each
 * other — see app/api/bookings/dates/route.js's exclusivity rule), so
 * this always renders a list and lets the admin pick which one to
 * Edit or Delete.
 *
 * DATA FLOW:
 * 1. Parent page passes the array of bookings for the clicked day
 * 2. "Edit" hands that single booking back up via onEditBooking, which
 *    opens BookingEditModal
 * 3. "Delete" hands it back via onDeleteBooking, which opens the
 *    shared ConfirmationModal
 */
"use client";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(isoString) {
  return DATE_FORMATTER.format(new Date(isoString));
}

export default function BookingDayModal({ dayBookings, isOpen, onClose, onEditBooking, onDeleteBooking }) {
  if (!isOpen) return null;

  return (
    <div className="adminModalBackdrop" role="dialog" aria-modal="true" aria-labelledby="bookingDayModalTitle">
      <div className="adminModalDialog bookingDayModalDialog">
        <h2 id="bookingDayModalTitle" className="adminModalTitle">
          {dayBookings.length > 1 ? `${dayBookings.length} bookings this day` : "Booking details"}
        </h2>

        <ul className="bookingDayModalList">
          {dayBookings.map((booking) => (
            <li key={booking.id} className="bookingDayModalItem">
              <div className="bookingDayModalItemInfo">
                <span className="bookingDayModalGuestName">{booking.guestName}</span>
                <span className="bookingDayModalDates">
                  {formatDate(booking.checkInDate)} – {formatDate(booking.checkOutDate)}
                </span>
                <span className="bookingDayModalRoom">{booking.room?.name ?? "—"}</span>
              </div>
              <div className="bookingDayModalItemActions">
                <button type="button" className="bookingsEditButton" onClick={() => onEditBooking(booking)}>
                  Edit
                </button>
                <button type="button" className="bookingsDeleteButton" onClick={() => onDeleteBooking(booking)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="adminModalActions">
          <button type="button" className="adminModalButtonNeutral" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
