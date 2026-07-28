/**
 * FILE: app/superAdmin/(protected)/bookings/page.jsx
 * ROLE: Super-admin only — protected by middleware.js + requireSuperAdmin()
 *
 * PURPOSE:
 * Two-panel Bookings control center: BookingsListPanel (ascending
 * table, filterable by status) and BookingsCalendarPanel (month-grid
 * view of occupied dates). Admins can cancel (soft), fully edit, or
 * permanently delete any booking from either panel.
 *
 * DATA FLOW:
 * 1. On mount, fetches GET /api/admin/bookings (all statuses, ascending
 *    by check-in) and fires POST /api/admin/bookings/mark-viewed
 *    (fire-and-forget) so the Sidebar's "new bookings" badge clears
 * 2. List panel's "Cancel booking" -> ConfirmationModal -> PATCH
 * 3. Either panel's "Edit" -> BookingEditModal -> PUT
 * 4. Either panel's "Delete" -> ConfirmationModal -> DELETE
 * 5. Any successful mutation increments reloadToken to refetch the list
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import ConfirmationModal from "@/components/superAdmin/ConfirmationModal";
import ToastStack from "@/components/superAdmin/shared/ToastStack";
import { useToast } from "@/components/superAdmin/shared/useToast";
import BookingsListPanel from "./BookingsListPanel";
import BookingsCalendarPanel from "./BookingsCalendarPanel";
import BookingDayModal from "./BookingDayModal";
import BookingEditModal from "./BookingEditModal";
import "./Bookings.css";

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Which booking the "Cancel booking" confirmation modal is targeting — null means closed
  const [bookingPendingCancel, setBookingPendingCancel] = useState(null);
  // Which booking the "Delete" confirmation modal is targeting — null means closed
  const [bookingPendingDelete, setBookingPendingDelete] = useState(null);
  // Bookings for a clicked calendar day (BookingDayModal) — null means closed
  const [selectedDayBookings, setSelectedDayBookings] = useState(null);
  // Single booking currently open in the full edit form — null means closed
  const [editingBooking, setEditingBooking] = useState(null);

  const { toasts, showToast, dismissToast } = useToast();

  /* Fetches the full booking list. Re-run after any successful mutation, or by the error state's retry button. */
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

  /* Resets this admin's "new bookings" sidebar badge baseline the moment they open this page — fire-and-forget, never blocks the list fetch above */
  useEffect(() => {
    fetch("/api/admin/bookings/mark-viewed", { method: "POST" }).catch(() => {
      // Non-critical — worst case the badge count stays slightly stale until the next successful call
    });
  }, []);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  /* Sends the PATCH cancel (soft) request for whichever booking the cancel modal is currently open for */
  const handleConfirmCancel = useCallback(async () => {
    if (!bookingPendingCancel) return;
    try {
      const response = await fetch(`/api/admin/bookings/${bookingPendingCancel.id}`, { method: "PATCH" });
      const result = await response.json();
      if (!result.success) {
        showToast("✕ " + result.message, "error");
        return;
      }
      showToast(`✓ Booking for ${bookingPendingCancel.guestName} cancelled.`, "success");
      refetch();
    } catch {
      showToast("✕ Network error — please try again.", "error");
    } finally {
      setBookingPendingCancel(null);
    }
  }, [bookingPendingCancel, showToast, refetch]);

  /* Sends the DELETE (permanent) request for whichever booking the delete modal is currently open for */
  const handleConfirmDelete = useCallback(async () => {
    if (!bookingPendingDelete) return;
    try {
      const response = await fetch(`/api/admin/bookings/${bookingPendingDelete.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!result.success) {
        showToast("✕ " + result.message, "error");
        return;
      }
      showToast(`✓ Booking for ${bookingPendingDelete.guestName} deleted.`, "success");
      setSelectedDayBookings(null); // close the day modal too, since its list is now stale
      refetch();
    } catch {
      showToast("✕ Network error — please try again.", "error");
    } finally {
      setBookingPendingDelete(null);
    }
  }, [bookingPendingDelete, showToast, refetch]);

  /* Sends the PUT full-edit request for whichever booking BookingEditModal currently has open */
  async function handleSubmitEdit(formData) {
    try {
      const response = await fetch(`/api/admin/bookings/${editingBooking.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      if (!result.success) {
        showToast("✕ " + result.message, "error");
        return;
      }
      showToast(`✓ Booking for ${formData.guestName} updated.`, "success");
      setEditingBooking(null);
      setSelectedDayBookings(null); // close the day modal too, since its list is now stale
      refetch();
    } catch {
      showToast("✕ Network error — please try again.", "error");
    }
  }

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
          <button type="button" className="bookingsRetryButton" onClick={refetch}>
            Try again
          </button>
        </div>
      )}

      {!isLoading && !loadError && (
        <div className="bookingsPanelsGrid">
          <BookingsListPanel
            bookings={bookings}
            onCancelClick={setBookingPendingCancel}
            onEditClick={setEditingBooking}
          />
          <BookingsCalendarPanel
            bookings={bookings}
            onDayClick={setSelectedDayBookings}
          />
        </div>
      )}

      <BookingDayModal
        isOpen={selectedDayBookings !== null}
        dayBookings={selectedDayBookings ?? []}
        onClose={() => setSelectedDayBookings(null)}
        onEditBooking={setEditingBooking}
        onDeleteBooking={setBookingPendingDelete}
      />

      <BookingEditModal
        key={editingBooking?.id ?? "none"}
        isOpen={editingBooking !== null}
        booking={editingBooking}
        onSubmit={handleSubmitEdit}
        onCancel={() => setEditingBooking(null)}
      />

      <ConfirmationModal
        isOpen={bookingPendingCancel !== null}
        title="Cancel booking?"
        description={
          bookingPendingCancel
            ? `Are you sure you want to cancel ${bookingPendingCancel.guestName}'s booking? This frees up those dates for other guests and cannot be undone.`
            : ""
        }
        confirmLabel="Cancel booking"
        onConfirm={handleConfirmCancel}
        onCancel={() => setBookingPendingCancel(null)}
      />

      <ConfirmationModal
        isOpen={bookingPendingDelete !== null}
        title="Delete booking permanently?"
        description={
          bookingPendingDelete
            ? `Are you sure you want to permanently delete ${bookingPendingDelete.guestName}'s booking? Unlike cancelling, this removes the record entirely and cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setBookingPendingDelete(null)}
      />
    </section>
  );
}
