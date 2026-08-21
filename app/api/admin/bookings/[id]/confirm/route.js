/**
 * FILE: app/api/admin/bookings/[id]/confirm/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), not middleware.js
 *
 * PURPOSE:
 * Approves a "pending" booking after the owner has reviewed the
 * guest's invoice PDF on Facebook Messenger (no PayMongo integration
 * yet — see app/api/bookings/route.js and services/invoicePdf.js).
 * Flips status to "confirmed" and clears pendingExpiresAt so the
 * booking-expiry cron (app/api/cron/booking-expiry/route.js) never
 * touches it again.
 *
 * DATA FLOW:
 * 1. Admin opens the "Pending" tab on the Bookings page, reviews the
 *    guest's Messenger thread, clicks "Confirm booking"
 * 2. POST /api/admin/bookings/{id}/confirm
 * 3. requireSuperAdmin() verifies the session
 * 4. Booking is looked up by id; 404 if missing, 409 if it's not
 *    currently "pending" (already confirmed/cancelled/expired)
 * 5. status -> "confirmed", pendingExpiresAt -> null
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";
import { isExclusionViolation } from "@/services/pgErrorCodes";
import { sendBookingConfirmationEmail } from "@/services/bookingConfirmationEmail";
import { sendBookedBookingTelegramAlert } from "@/services/bookingTelegramAlerts";

export async function POST(request, { params }) {
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

    if (existingBooking.status !== "pending") {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: `This booking is already "${existingBooking.status}" — nothing to confirm.`,
        },
        { status: 409 }
      );
    }

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: { status: "confirmed", pendingExpiresAt: null },
      include: { room: true },
    });

    // Best-effort — a failed email must never fail an already-confirmed
    // booking. Carries the resort rules (live from Content > Policies)
    // and any admin-attached images (Content > Booking Confirmation Email).
    sendBookingConfirmationEmail({ booking: updatedBooking }).catch((error) => {
      console.error("[api/admin/bookings/[id]/confirm] Failed to send confirmation email:", error.message);
    });

    // Admin Telegram alert — "Booked" event (Task 1). Best-effort,
    // never blocks an already-confirmed booking.
    sendBookedBookingTelegramAlert(updatedBooking).catch((error) => {
      console.error("[api/admin/bookings/[id]/confirm] Failed to send Telegram alert:", error.message);
    });

    // Audit trail (Rule 6) — who approved which guest's pending booking, and when.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Confirmed pending booking for ${existingBooking.guestName} (${existingBooking.checkInDate
        .toISOString()
        .slice(0, 10)} – ${existingBooking.checkOutDate.toISOString().slice(0, 10)}).`,
    });

    return NextResponse.json({
      success: true,
      data: { booking: updatedBooking },
      message: "Booking confirmed successfully.",
    });
  } catch (error) {
    // Extremely unlikely at confirm-time (this booking already held its
    // dates as "pending" against the same exclusion constraint), but
    // handled the same friendly way as PUT/PATCH above just in case.
    if (isExclusionViolation(error)) {
      return NextResponse.json(
        { success: false, data: null, message: "Those dates were just taken by another confirmed booking." },
        { status: 409 }
      );
    }
    console.error("[api/admin/bookings/[id]/confirm] Failed to confirm booking:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to confirm the booking. Please try again." },
      { status: 500 }
    );
  }
}
