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
