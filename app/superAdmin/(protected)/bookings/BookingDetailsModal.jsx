/**
 * FILE: app/superAdmin/(protected)/bookings/BookingDetailsModal.jsx
 * ROLE: Super-admin only — rendered from the parent Bookings page
 *
 * PURPOSE:
 * Read-only "view details" modal — opens when an admin clicks anywhere
 * on a booking row in BookingsListPanel (except the row's own action
 * buttons, which stop propagation so they don't also open this modal).
 * Shows everything BookingsListPanel's table doesn't have room for:
 * guest contact info, package amounts, notes, reference code, and
 * where the booking came from (IP-resolved city/country). Surfaces
 * the same Confirm/Reject/Edit actions as the row itself so an admin
 * reviewing details doesn't have to close this and hunt for the row
 * again to act on it.
 *
 * DATA FLOW:
 * 1. Parent page passes the `booking` being viewed (never null when isOpen)
 * 2. "Confirm booking" / "Reject" / "Cancel booking" / "Edit" call back
 *    up to the same handlers the list panel's row buttons already use —
 *    this modal owns no mutation logic itself, only the read-only layout
 */
"use client";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const PESO = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  expired: "Expired",
};

function formatDate(isoString) {
  return DATE_FORMATTER.format(new Date(isoString));
}

export default function BookingDetailsModal({
  booking,
  isOpen,
  onClose,
  onConfirmClick,
  onCancelClick,
  onEditClick,
}) {
  if (!isOpen || !booking) return null;

  return (
    <div className="adminModalBackdrop" role="dialog" aria-modal="true" aria-labelledby="bookingDetailsModalTitle">
      <div className="adminModalDialog bookingDetailsModalDialog">
        <div className="bookingDetailsModalHeader">
          <h2 id="bookingDetailsModalTitle" className="adminModalTitle">
            {booking.guestName}
          </h2>
          <span className={`bookingsStatusBadge bookingsStatusBadge--${booking.status}`}>
            {STATUS_LABELS[booking.status] ?? booking.status}
          </span>
        </div>

        <dl className="bookingDetailsGrid">
          <dt>Reference code</dt>
          <dd>{booking.referenceCode}</dd>

          <dt>Room / Villa</dt>
          <dd>{booking.room?.name ?? "—"}</dd>

          <dt>Booking type</dt>
          <dd>{booking.bookingType?.replace("_", " ") ?? "—"}</dd>

          <dt>Check-in</dt>
          <dd>{formatDate(booking.checkInDate)}</dd>

          <dt>Check-out</dt>
          <dd>{formatDate(booking.checkOutDate)}</dd>

          <dt>Guests</dt>
          <dd>{booking.numberOfGuests}</dd>

          <dt>Email</dt>
          <dd>{booking.guestEmail || "—"}</dd>

          <dt>Phone</dt>
          <dd>{booking.guestPhone || "—"}</dd>

          <dt>Total amount</dt>
          <dd>{PESO.format(Number(booking.totalAmount))}</dd>

          {Number(booking.depositAmount) > 0 && (
            <>
              <dt>Deposit due</dt>
              <dd>{PESO.format(Number(booking.depositAmount))}</dd>
            </>
          )}

          {(booking.geoCity || booking.geoCountry) && (
            <>
              <dt>Submitted from</dt>
              <dd>{[booking.geoCity, booking.geoCountry].filter(Boolean).join(", ")}</dd>
            </>
          )}

          {booking.notes && (
            <>
              <dt>Notes</dt>
              <dd>{booking.notes}</dd>
            </>
          )}
        </dl>

        <div className="adminModalActions bookingDetailsModalActions">
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
            <button type="button" className="bookingsCancelButton" onClick={() => onCancelClick(booking)}>
              Cancel booking
            </button>
          )}
          <button type="button" className="bookingsEditButton" onClick={() => onEditClick(booking)}>
            Edit
          </button>
          <button type="button" className="adminModalButtonNeutral" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
