/**
 * FILE: app/superAdmin/(protected)/bookings/BookingEditModal.jsx
 * ROLE: Super-admin only — rendered from the parent Bookings page
 *
 * PURPOSE:
 * Full edit form for a single booking (dates, guest name/email/phone,
 * guest count, notes) — opened either from the list panel's "Edit"
 * button or from BookingDayModal's "Edit" action. Follows the same
 * React Hook Form + Zod pattern as the other superAdmin modal forms
 * (e.g. TestimonialFormModal.jsx).
 *
 * DATA FLOW:
 * 1. Parent passes the `booking` being edited (never null when isOpen)
 * 2. On submit, hands the validated payload up via onSubmit — the
 *    parent page owns the actual PUT /api/admin/bookings/{id} call so
 *    all fetch/toast/refetch logic stays in one place
 */
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

function toDateInputValue(isoString) {
  return new Date(isoString).toISOString().slice(0, 10);
}

const bookingEditSchema = z
  .object({
    guestName: z.string().min(1, "Guest name is required."),
    guestEmail: z.string().email("Enter a valid email address.").or(z.literal("")),
    guestPhone: z.string(),
    numberOfGuests: z.coerce.number().min(1, "At least 1 guest is required."),
    checkInDate: z.string().min(1, "Check-in date is required."),
    checkOutDate: z.string().min(1, "Check-out date is required."),
    notes: z.string(),
  })
  .refine((data) => data.checkOutDate > data.checkInDate, {
    message: "Check-out date must be after check-in date.",
    path: ["checkOutDate"],
  });

export default function BookingEditModal({ isOpen, booking, onSubmit, onCancel }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(bookingEditSchema),
    // Re-derives defaults from `booking` on every open via `key` on the
    // parent's render (see page.jsx) — RHF only reads defaultValues once
    // per mount, so the parent remounts this modal per booking.
    defaultValues: booking
      ? {
          guestName: booking.guestName,
          guestEmail: booking.guestEmail ?? "",
          guestPhone: booking.guestPhone ?? "",
          numberOfGuests: booking.numberOfGuests ?? 1,
          checkInDate: toDateInputValue(booking.checkInDate),
          checkOutDate: toDateInputValue(booking.checkOutDate),
          notes: booking.notes ?? "",
        }
      : undefined,
  });

  if (!isOpen || !booking) return null;

  return (
    <div className="adminModalBackdrop" role="dialog" aria-modal="true" aria-labelledby="bookingEditModalTitle">
      <div className="adminModalDialog bookingEditModalDialog">
        <h2 id="bookingEditModalTitle" className="adminModalTitle">Edit Booking</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="bookingEditForm">
          <div className="bookingEditFormField">
            <label htmlFor="bookingEditGuestName">Guest Name <span aria-hidden="true">*</span></label>
            <input id="bookingEditGuestName" type="text" autoFocus {...register("guestName")} />
            {errors.guestName && <span role="alert" className="bookingEditFormError">{errors.guestName.message}</span>}
          </div>

          <div className="bookingEditFormRow">
            <div className="bookingEditFormField">
              <label htmlFor="bookingEditGuestEmail">Guest Email</label>
              <input id="bookingEditGuestEmail" type="email" {...register("guestEmail")} />
              {errors.guestEmail && <span role="alert" className="bookingEditFormError">{errors.guestEmail.message}</span>}
            </div>
            <div className="bookingEditFormField">
              <label htmlFor="bookingEditGuestPhone">Guest Phone</label>
              <input id="bookingEditGuestPhone" type="tel" {...register("guestPhone")} />
            </div>
          </div>

          <div className="bookingEditFormRow">
            <div className="bookingEditFormField">
              <label htmlFor="bookingEditCheckIn">Check-in <span aria-hidden="true">*</span></label>
              <input id="bookingEditCheckIn" type="date" {...register("checkInDate")} />
              {errors.checkInDate && <span role="alert" className="bookingEditFormError">{errors.checkInDate.message}</span>}
            </div>
            <div className="bookingEditFormField">
              <label htmlFor="bookingEditCheckOut">Check-out <span aria-hidden="true">*</span></label>
              <input id="bookingEditCheckOut" type="date" {...register("checkOutDate")} />
              {errors.checkOutDate && <span role="alert" className="bookingEditFormError">{errors.checkOutDate.message}</span>}
            </div>
            <div className="bookingEditFormField">
              <label htmlFor="bookingEditGuestCount">Guests</label>
              <input id="bookingEditGuestCount" type="number" min={1} {...register("numberOfGuests")} />
              {errors.numberOfGuests && <span role="alert" className="bookingEditFormError">{errors.numberOfGuests.message}</span>}
            </div>
          </div>

          <div className="bookingEditFormField">
            <label htmlFor="bookingEditNotes">Notes</label>
            <textarea id="bookingEditNotes" rows={3} {...register("notes")} />
          </div>

          <div className="adminModalActions">
            <button type="button" className="adminModalButtonNeutral" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="bookingEditSaveButton" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
