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
 * bookings. Also sends the guest a best-effort "Booking Cancelled"
 * email — covers both an admin rejecting a still-"pending" booking and
 * cancelling an already-"confirmed" one.
 *
 * DATA FLOW:
 * 1. Admin clicks "Cancel booking" on a row -> confirms in the
 *    ConfirmationModal -> PATCH /api/admin/bookings/{id}
 * 2. requireSuperAdmin() verifies the session
 * 3. Booking is looked up by id; 404 if it doesn't exist
 * 4. status is updated to "cancelled"
 * 5. If the booking has a guestEmail, sends the "cancelled" template
 *    email (super-admin > Content > Booking Email Templates) — never
 *    blocks the cancellation itself if the send fails
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";
import { isExclusionViolation } from "@/services/pgErrorCodes";
import { deleteFromR2 } from "@/services/r2";
import { sendGeneralEmail } from "@/services/emailjs";
import { getOrCreateEmailTemplate, renderTemplateText } from "@/services/bookingEmailTemplates";

const FULL_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

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

    // The booking row is gone entirely — its saved route PNG (Rule
    // 35.6, "directions/" folder) would otherwise be orphaned in R2
    // forever with nothing left pointing to it. Never let a failed R2
    // delete block the permanent delete itself, which already succeeded.
    if (existingBooking.directionsMapImageKey) {
      try {
        await deleteFromR2(existingBooking.directionsMapImageKey);
      } catch (error) {
        console.error("[api/admin/bookings/[id]] Failed to delete R2 directions image:", error.message);
      }
    }

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
      data: {
        status: "cancelled",
        // Cancelled bookings no longer need their saved route image —
        // clear the DB pointer alongside the R2 delete below so a
        // cancelled booking never shows a stale/deleted map URL.
        directionsMapImageUrl: null,
        directionsMapImageKey: null,
      },
    });

    // Delete the saved route PNG from Cloudflare R2 (Rule 35.6) so a
    // cancelled booking doesn't leave an orphaned image behind. Never
    // let a failed R2 delete block the cancellation itself — the
    // booking status change above already succeeded.
    if (existingBooking.directionsMapImageKey) {
      try {
        await deleteFromR2(existingBooking.directionsMapImageKey);
      } catch (error) {
        console.error("[api/admin/bookings/[id]] Failed to delete R2 directions image:", error.message);
      }
    }

    // Audit trail (Rule 6) — who cancelled which guest's booking, and when.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
      request,
      details: `Cancelled booking for ${existingBooking.guestName} (${existingBooking.checkInDate.toISOString().slice(0, 10)} – ${existingBooking.checkOutDate.toISOString().slice(0, 10)}).`,
    });

    // Best-effort cancellation email — never blocks the cancellation
    // itself, same pattern as app/api/bookings/manage/cancel/route.js's
    // guest self-cancel email. Covers BOTH cases this PATCH handles:
    // the admin rejecting a still-"pending" booking, and cancelling an
    // already-"confirmed" one — this was previously missing entirely,
    // so a guest never found out their booking was rejected/cancelled
    // unless the admin told them some other way.
    if (existingBooking.guestEmail) {
      try {
        // Admin-editable copy (super-admin > Content > Booking Email
        // Templates > Booking Cancelled). Its default wording reads
        // "cancelled at your request," written for the guest
        // self-cancel flow — reword it in that page if you want
        // different copy for an admin-initiated rejection specifically.
        const cancelledTemplate = await getOrCreateEmailTemplate("cancelled");
        const mergeVars = { guestName: existingBooking.guestName };

        await sendGeneralEmail({
          toEmail: existingBooking.guestEmail,
          subject: `your-private-resort — Booking Cancelled (${existingBooking.referenceCode})`,
          eyebrow: renderTemplateText(cancelledTemplate.eyebrowText, mergeVars),
          heading: renderTemplateText(cancelledTemplate.headingText, mergeVars),
          intro: renderTemplateText(cancelledTemplate.introMessage, mergeVars),
          highlightLine1: `Reference code: ${existingBooking.referenceCode}`,
          highlightLine2: `${FULL_DATE.format(existingBooking.checkInDate)} → ${FULL_DATE.format(existingBooking.checkOutDate)}`,
          bodyMessage: renderTemplateText(cancelledTemplate.bodyMessage, mergeVars),
        });
      } catch (error) {
        console.error("[api/admin/bookings/[id]] Failed to send cancellation email:", error.message);
      }
    }

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