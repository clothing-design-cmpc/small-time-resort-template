/**
 * FILE: app/api/admin/bookings/[id]/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Cancels a single booking. Sets status to "cancelled" instead of
 * deleting the row (soft delete — Rule 6) so cancelled stays visible in
 * the admin history, and its dates immediately free up on the visitor
 * site's Booked Dates section + Reserve Your Villa picker, since both
 * only read /api/bookings/dates, which only expands status: "confirmed"
 * bookings.
 *
 * DATA FLOW:
 * 1. Admin clicks "Cancel booking" on a row -> confirms in the
 *    ConfirmationModal -> PATCH /api/admin/bookings/{id}
 * 2. requireSuperAdmin() verifies the session
 * 3. Booking is looked up by id; 404 if it doesn't exist
 * 4. status is updated to "cancelled"
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";
import { isExclusionViolation } from "@/services/pgErrorCodes";

/**
 * PUT — full edit
 * Updates every editable field on a booking (dates, guest info, guest
 * count, notes) from the Bookings page's calendar edit modal. Distinct
 * from PATCH below, which only ever flips status to "cancelled".
 *
 * Relies on the DB-level EXCLUDE constraint
 * (prisma/addBookingExclusionConstraint.js) to reject a date change
 * that would overlap another confirmed booking — caught below as a
 * friendly 409 instead of a raw 500.
 */
export async function PUT(request, { params }) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  const { id } = await params;
  const body = await request.json();
  const { guestName, guestEmail, guestPhone, numberOfGuests, checkInDate, checkOutDate, notes } = body;

  // Required-field validation — mirrors the public booking form's own checks
  if (!guestName?.trim() || !checkInDate || !checkOutDate) {
    return NextResponse.json(
      { success: false, data: null, message: "Guest name, check-in, and check-out dates are required." },
      { status: 400 }
    );
  }
  if (new Date(checkOutDate) <= new Date(checkInDate)) {
    return NextResponse.json(
      { success: false, data: null, message: "Check-out date must be after check-in date." },
      { status: 400 }
    );
  }

  try {
    const existingBooking = await prisma.booking.findUnique({ where: { id } });
    if (!existingBooking) {
      return NextResponse.json(
        { success: false, data: null, message: "Booking not found." },
        { status: 404 }
      );
    }

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        guestName: guestName.trim(),
        guestEmail: guestEmail?.trim() ?? "",
        guestPhone: guestPhone?.trim() ?? "",
        numberOfGuests: Number(numberOfGuests) || 1,
        checkInDate: new Date(checkInDate),
        checkOutDate: new Date(checkOutDate),
        notes: notes?.trim() || null,
      },
    });

    // Audit trail (Rule 6) — who edited which guest's booking, and what changed.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Edited booking for ${updatedBooking.guestName} (${checkInDate} – ${checkOutDate}).`,
    });

    return NextResponse.json({
      success: true,
      data: { booking: updatedBooking },
      message: "Booking updated successfully.",
    });
  } catch (error) {
    // Another confirmed booking already occupies (part of) these dates
    if (isExclusionViolation(error)) {
      return NextResponse.json(
        { success: false, data: null, message: "Those dates overlap with another confirmed booking." },
        { status: 409 }
      );
    }
    console.error("[api/admin/bookings/[id]] Failed to update booking:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to update the booking. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * DELETE — permanent delete
 * Hard-removes a booking row entirely, distinct from PATCH's soft
 * cancel (status: "cancelled"). Used by the calendar edit modal's
 * "Delete" action when an admin wants the record gone, not just marked
 * cancelled (e.g. a duplicate or test entry).
 */
export async function DELETE(request, { params }) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  const { id } = await params;

  try {
    const existingBooking = await prisma.booking.findUnique({ where: { id } });
    if (!existingBooking) {
      return NextResponse.json(
        { success: false, data: null, message: "Booking not found." },
        { status: 404 }
      );
    }

    await prisma.booking.delete({ where: { id } });

    // Audit trail (Rule 6) — permanent deletes are irreversible, always log who did it.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Permanently deleted booking for ${existingBooking.guestName} (${existingBooking.checkInDate.toISOString().slice(0, 10)} – ${existingBooking.checkOutDate.toISOString().slice(0, 10)}).`,
    });

    return NextResponse.json({
      success: true,
      data: null,
      message: "Booking deleted successfully.",
    });
  } catch (error) {
    console.error("[api/admin/bookings/[id]] Failed to delete booking:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to delete the booking. Please try again." },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  const { id } = await params;

  try {
    const existingBooking = await prisma.booking.findUnique({ where: { id } });
    if (!existingBooking) {
      return NextResponse.json(
        { success: false, data: null, message: "Booking not found." },
        { status: 404 }
      );
    }

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: { status: "cancelled" },
    });

    // Audit trail (Rule 6) — who cancelled which guest's booking, and when.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Cancelled booking for ${existingBooking.guestName} (${existingBooking.checkInDate.toISOString().slice(0, 10)} – ${existingBooking.checkOutDate.toISOString().slice(0, 10)}).`,
    });

    return NextResponse.json({
      success: true,
      data: { booking: updatedBooking },
      message: "Booking cancelled successfully.",
    });
  } catch (error) {
    console.error("[api/admin/bookings/[id]] Failed to cancel booking:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to cancel the booking. Please try again." },
      { status: 500 }
    );
  }
}
