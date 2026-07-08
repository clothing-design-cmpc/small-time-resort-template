/**
 * FILE: app/superAdmin/(protected)/bookings/page.jsx
 * ROLE: Super-admin only — protected by middleware.js + requireSuperAdmin()
 *
 * PURPOSE:
 * Read/manage view of every Booking row (confirmed and cancelled) so
 * admins can see exactly what the visitor site's Booked Dates section
 * and Reserve Your Villa picker are showing guests, and cancel a
 * booking if needed — the same Booking table both the visitor site and
 * this page read from.
 *
 * DATA FLOW:
 * 1. On mount, fetches GET /api/admin/bookings
 * 2. Cancelling a row opens ConfirmationModal; confirming calls
 *    PATCH /api/admin/bookings/{id}, then refetches the list and fires
 *    a toast
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import ToastStack from "@/components/superAdmin/shared/ToastStack";
import { useToast } from "@/components/superAdmin/shared/useToast";
import "./Bookings.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(isoString) {
  return DATE_FORMATTER.format(new Date(isoString));
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  // Which booking the "Cancel booking" confirmation modal is currently targeting — null means closed
  const [bookingPendingCancel, setBookingPendingCancel] = useState(null);

  const { toasts, showToast, dismissToast } = useToast();

  /* Fetches the full booking list. Re-run after a successful cancel, or by the error state's retry button. */
  useEffect(() => {
    let isCancelled = false;

    async function fetchBookings() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch("/api/admin/bookings");
        const result = await response.json();
        if (isCancelled) return;

        if (!result.success) {
          setLoadError(result.message || "Failed to load bookings. Please try again.");
          return;
        }
        setBookings(result.data.bookings);
      } catch {
        if (!isCancelled) {
          setLoadError("We couldn't reach the server. Check your connection and try again.");
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    fetchBookings();
    return () => {
      isCancelled = true;
    };
  }, [reloadToken]);

  /* Sends the PATCH cancel request for whichever booking the modal is currently open for */
  const handleConfirmCancel = useCallback(async () => {
    if (!bookingPendingCancel) return;

    try {
      const response = await fetch(`/api/admin/bookings/${bookingPendingCancel.id}`, {
        method: "PATCH",
      });
      const result = await response.json();

      if (!result.success) {
        showToast("✕ " + result.message, "error");
        return;
      }

      showToast(`✓ Booking for ${bookingPendingCancel.guestName} cancelled.`, "success");
      setReloadToken((token) => token + 1);
    } catch {
      showToast("✕ Network error — please try again.", "error");
    } finally {
      setBookingPendingCancel(null);
    }
  }, [bookingPendingCancel, showToast]);

  return (
    <section className="bookingsSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="bookingsHeaderRow">
        <span className="bookingsEyebrow">Reservations</span>
        <h1 className="bookingsTitle">Bookings</h1>
      </div>

      {/* Loading state — static text only, no skeleton/animation, per the
          super-admin static design principle (zero animations, zero
          skeleton screens; admin data is expected to load fast). */}
      {isLoading && (
        <p className="bookingsLoadingText" aria-live="polite">Loading bookings…</p>
      )}

      {/* Error state */}
      {!isLoading && loadError && (
        <div className="bookingsErrorState">
          <p className="bookingsErrorMessage">{loadError}</p>
          <button
            type="button"
            className="bookingsRetryButton"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !loadError && bookings.length === 0 && (
        <div className="bookingsEmptyState">
          <p className="bookingsEmptyTitle">No bookings yet.</p>
          <p className="bookingsEmptySubtitle">Reservations made by guests will show up here.</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !loadError && bookings.length > 0 && (
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
              {bookings.map((booking) => (
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
                    {booking.status === "confirmed" && (
                      <button
                        type="button"
                        className="bookingsCancelButton"
                        onClick={() => setBookingPendingCancel(booking)}
                      >
                        Cancel booking
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmationModal
        isOpen={bookingPendingCancel !== null}
        title="Cancel booking?"
        description={
          bookingPendingCancel
            ? `Are you sure you want to cancel ${bookingPendingCancel.guestName}'s booking (${formatDate(bookingPendingCancel.checkInDate)} – ${formatDate(bookingPendingCancel.checkOutDate)})? This frees up those dates for other guests and cannot be undone.`
            : ""
        }
        confirmLabel="Cancel booking"
        onConfirm={handleConfirmCancel}
        onCancel={() => setBookingPendingCancel(null)}
      />
    </section>
  );
}
