/**
 * FILE: app/api/bookings/manage/reschedule/route.js
 * ROLE: Public — no auth required, called by the visitor "Rebook" flow
 *       (components/shared/RebookCalendarModal.jsx)
 *
 * PURPOSE:
 * Moves an existing CONFIRMED booking to new dates picked on the same
 * calendar UI the normal booking flow uses (RoomAvailabilityCalendar),
 * keeping everything else about the booking identical — same
 * reference code, guest info, room, and total/deposit amount already
 * quoted. Deliberately scoped to same-length stays only (see the
 * nights-match check below) so this never has to re-run the full
 * pricing/rules engine (services/bookingPricing.js) — a guest who
 * wants a different NUMBER of nights (not just different dates) is
 * pointed to call the resort instead, same as any other booking change
 * outside this flow.
 *
 * DATA FLOW:
 * 1. RebookCalendarModal POSTs { referenceCode, checkInDate, checkOutDate }
 * 2. Rate limited to 10 attempts per 15 minutes per IP (Rule 32.1)
 * 3. Booking looked up by referenceCode; must still be "confirmed"
 * 4. New dates validated: not in the past, same stay length as the
 *    original (same nights for Overnight, same-day for Day/Night Tour)
 * 5. Overlap-checked against every OTHER confirmed booking for this
 *    room (explicitly excluding this booking's own id — its current,
 *    about-to-change dates must never count as a conflict with itself)
 *    plus this room's blackout ranges
 * 6. Only checkInDate/checkOutDate are updated — totalAmount,
 *    depositAmount, guest info, room, and referenceCode are untouched
 * 7. The DB-level EXCLUDE constraint (prisma/addBookingExclusionConstraint.js)
 *    is the final authoritative guard against a race condition — caught
 *    below as a friendly 409 instead of a raw 500, same pattern as the
 *    super-admin edit route (app/api/admin/bookings/[id]/route.js)
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/services/prisma";
import { checkRateLimit } from "@/services/rateLimit";
import { logSecurityEvent } from "@/services/securityLog";
import { isExclusionViolation } from "@/services/pgErrorCodes";
import { sendGeneralEmail } from "@/services/emailjs";
import { getActiveBookingRule } from "@/services/bookingRules";

// Same per-type start/end time fields the manage lookup route reads.
const START_TIME_FIELD_BY_TYPE = {
  overnight: "checkInTime",
  day_tour: "dayTourStartTime",
  night_tour: "nightTourStartTime",
};
const END_TIME_FIELD_BY_TYPE = {
  overnight: "checkOutTime",
  day_tour: "dayTourEndTime",
  night_tour: "nightTourEndTime",
};

const RESCHEDULE_MAX_ATTEMPTS = 10;
const RESCHEDULE_WINDOW_MS = 15 * 60 * 1000;

const rescheduleSchema = z.object({
  referenceCode: z.string().trim().min(1).max(40),
  checkInDate: z.string().min(1),
  checkOutDate: z.string().min(1),
});

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkRateLimit(`manage-reschedule:${ip}`, RESCHEDULE_MAX_ATTEMPTS, RESCHEDULE_WINDOW_MS);
  if (!allowed) {
    await logSecurityEvent({
      eventType: "rate_limit_hit",
      actor: null,
      request,
      details: `Exceeded ${RESCHEDULE_MAX_ATTEMPTS} self-service reschedule attempts within 15 minutes.`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Too many attempts. Please try again in a bit." },
      { status: 429 }
    );
  }

  let payload;
  try {
    payload = rescheduleSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Please select valid dates." },
      { status: 400 }
    );
  }

  try {
    const booking = await prisma.booking.findUnique({
      where: { referenceCode: payload.referenceCode.toUpperCase() },
    });

    if (!booking || booking.status !== "confirmed") {
      return NextResponse.json(
        { success: false, data: null, message: "That reference code wasn't found or is already cancelled." },
        { status: 404 }
      );
    }

    const today = startOfDay(new Date());
    const newCheckIn = startOfDay(new Date(`${payload.checkInDate}T00:00:00`));
    const newCheckOut = startOfDay(new Date(`${payload.checkOutDate}T00:00:00`));

    if (Number.isNaN(newCheckIn.getTime()) || Number.isNaN(newCheckOut.getTime()) || newCheckIn < today) {
      return NextResponse.json(
        { success: false, data: null, message: "Please select a valid, upcoming date." },
        { status: 400 }
      );
    }

    // Guard against a silent no-op reschedule: RebookCalendarModal's
    // calendar restarts its range on EVERY click once a full range is
    // already picked — including the very first click, since the modal
    // pre-fills the calendar with the booking's CURRENT dates before
    // the guest has touched anything (see that component's
    // handleSelectRange comment). If the guest's last tap before
    // hitting Confirm lands back on their original check-in day (e.g.
    // scrolling back to double-check something), the calendar silently
    // re-selects the ORIGINAL dates with no visual warning, and Confirm
    // would otherwise still "succeed" — stamping rebookedAt and sending
    // a "Booking Rebooked" email/invoice while checkInDate/checkOutDate
    // never actually moved. That is precisely what the confirmed
    // bd49cbd3 / 5a483bc9 rows show: rebookedAt set, dates unchanged.
    const isUnchanged =
      newCheckIn.getTime() === startOfDay(booking.checkInDate).getTime() &&
      newCheckOut.getTime() === startOfDay(booking.checkOutDate).getTime();
    if (isUnchanged) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: "Those are your current dates — please pick different ones, or close this if you didn't mean to change anything.",
        },
        { status: 400 }
      );
    }

    // Same stay length as the original — see file header for why this
    // flow deliberately never re-prices the booking.
    const originalNights = daysBetween(booking.checkInDate, booking.checkOutDate);
    const newNights = daysBetween(newCheckIn, newCheckOut);

    if (booking.bookingType === "overnight") {
      if (newNights !== originalNights) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: `Please select ${originalNights} night(s) to match your original booking. To change your stay length, please call us instead.`,
          },
          { status: 400 }
        );
      }
    } else {
      // Day Tour / Night Tour — always a single same-day booking
      if (newCheckIn.getTime() !== newCheckOut.getTime()) {
        return NextResponse.json(
          { success: false, data: null, message: "Please select a single date for this booking." },
          { status: 400 }
        );
      }
    }

    // --- Overlap check, excluding this booking's own (soon-to-change) row ---
    if (booking.roomId) {
      const otherConfirmedBookings = await prisma.booking.findMany({
        where: { roomId: booking.roomId, status: "confirmed", id: { not: booking.id } },
        select: { checkInDate: true, checkOutDate: true, bookingType: true },
      });

      const requestedOverlaps = otherConfirmedBookings.some((existing) => {
        const existingCheckOut =
          existing.bookingType === "overnight"
            ? existing.checkOutDate
            : new Date(existing.checkInDate.getTime() + 86400000);
        return newCheckIn < existingCheckOut && newCheckOut > existing.checkInDate;
      });
      if (requestedOverlaps) {
        return NextResponse.json(
          { success: false, data: null, message: "Those dates are already booked. Please pick a different date." },
          { status: 409 }
        );
      }

      const blackoutRanges = await prisma.blackoutDate.findMany({
        where: { roomId: booking.roomId },
        select: { startDate: true, endDate: true },
      });
      const hitsBlackout = blackoutRanges.some(
        (blackout) => newCheckIn < blackout.endDate && newCheckOut >= blackout.startDate
      );
      if (hitsBlackout) {
        return NextResponse.json(
          { success: false, data: null, message: "This room is closed for part of your selected date range. Please pick a different date." },
          { status: 409 }
        );
      }
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: booking.id },
      data: { checkInDate: newCheckIn, checkOutDate: newCheckOut, rebookedAt: new Date() },
    });

    // Same permanent, live-generated invoice link pattern as the booking
    // creation route (app/api/bookings/route.js) — keyed by booking.id,
    // which never changes across a reschedule, so services/invoicePdf.js
    // picks up the NEW dates and swaps the watermark to REBOOK
    // automatically (drawWatermark's rebookedAt check) the moment it's
    // requested. The gap this closes: nothing previously told the guest
    // a new invoice reflecting the move existed, so the ONLY invoice
    // link they had was the original "Booking Confirmed" email — which,
    // while technically still live, was never re-surfaced after this
    // reschedule, and this route never sent any notice of its own.
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    const invoiceUrl = siteUrl ? `${siteUrl}/api/bookings/${updatedBooking.id}/invoice` : null;

    try {
      // Best-effort notice — a failed send must never fail an already-
      // moved booking. Mirrors the confirmation email sent at booking
      // creation, but calls out that this is an updated invoice for
      // rebooked dates.
      await sendGeneralEmail({
        toEmail: updatedBooking.guestEmail,
        subject: `your-private-resort — Booking Rebooked (${updatedBooking.referenceCode})`,
        eyebrow: "BOOKING REBOOKED",
        heading: `Your dates have been updated, ${updatedBooking.guestName}!`,
        intro: "Your stay at your-private-resort has been moved to the new dates below. Your reference code stays the same.",
        highlightLine1: `Reference code: ${updatedBooking.referenceCode}`,
        highlightLine2: `${payload.checkInDate} → ${payload.checkOutDate}`,
        bodyMessage: invoiceUrl
          ? `Download your updated invoice here: ${invoiceUrl}`
          : "Your updated invoice with the reference code above is also available on the booking confirmation page.",
      });
    } catch (error) {
      console.error("[api/bookings/manage/reschedule] Failed to send rebooked confirmation email:", error.message);
    }

    const rules = await getActiveBookingRule(updatedBooking.bookingType);
    const checkInTime = rules[START_TIME_FIELD_BY_TYPE[updatedBooking.bookingType]] ?? null;
    const checkOutTime = rules[END_TIME_FIELD_BY_TYPE[updatedBooking.bookingType]] ?? null;

    return NextResponse.json({
      success: true,
      data: {
        booking: {
          referenceCode: updatedBooking.referenceCode,
          checkInDate: updatedBooking.checkInDate.toISOString().slice(0, 10),
          checkOutDate: updatedBooking.checkOutDate.toISOString().slice(0, 10),
          checkInTime,
          checkOutTime,
        },
        invoiceUrl,
      },
      message: "Your booking has been moved to the new dates.",
    });
  } catch (error) {
    if (isExclusionViolation(error)) {
      return NextResponse.json(
        { success: false, data: null, message: "Those dates were just booked by someone else. Please pick a different date." },
        { status: 409 }
      );
    }
    console.error("[api/bookings/manage/reschedule] Failed to reschedule booking:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to update your dates. Please try again or call us." },
      { status: 500 }
    );
  }
}
