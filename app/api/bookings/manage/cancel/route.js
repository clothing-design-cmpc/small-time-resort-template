/**
 * FILE: app/api/bookings/manage/cancel/route.js
 * ROLE: Public — no auth required, called by the visitor "Manage My
 *       Booking" floating widget (components/shared/ManageBookingWidget.jsx)
 *
 * PURPOSE:
 * Self-service cancellation: a guest who supplies a valid, still-
 * confirmed or still-pending reference code can cancel their own
 * booking directly. Unlike the super-admin's soft-cancel (status ->
 * "cancelled" — app/api/admin/bookings/[id]/route.js's PATCH), this
 * HARD-DELETES the row entirely: a guest cancelling their own booking
 * has no further need of that record, and removing it outright
 * guarantees the dates re-open immediately (the row is gone, so it
 * can't be caught by the exclusion constraint or any overlap check —
 * see prisma/addBookingExclusionConstraint.js, services/
 * bookingPricing.js, app/api/bookings/dates/route.js) without waiting
 * on any status-based filtering to agree.
 *
 * DATA FLOW:
 * 1. Widget POSTs { referenceCode } after the guest confirms in-modal
 * 2. Rate limited to 10 attempts per 15 minutes per IP (Rule 32.1) —
 *    same limiter family as lookup/verify-reference, since this is
 *    just as sensitive an action gated by the same credential
 * 3. Both a "confirmed" and a "pending" booking can be cancelled this
 *    way — a guest waiting on owner approval can back out too.
 *    Already-cancelled/expired-and-gone or unknown codes get a
 *    friendly, non-revealing message.
 * 4. Row is deleted; its R2 directions image (if any) is cleaned up
 * 5. Best-effort cancellation email confirms it to the guest
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/services/prisma";
import { checkRateLimit } from "@/services/rateLimit";
import { logSecurityEvent } from "@/services/securityLog";
import { deleteFromR2 } from "@/services/r2";
import { sendGeneralEmail } from "@/services/emailjs";
import { getOrCreateEmailTemplate, renderTemplateText } from "@/services/bookingEmailTemplates";
import { getResortDisplayName } from "@/services/resortName";

const CANCEL_MAX_ATTEMPTS = 10;
const CANCEL_WINDOW_MS = 15 * 60 * 1000;

const cancelSchema = z.object({
  referenceCode: z.string().trim().min(1).max(40),
});

const FULL_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkRateLimit(`manage-cancel:${ip}`, CANCEL_MAX_ATTEMPTS, CANCEL_WINDOW_MS);
  if (!allowed) {
    await logSecurityEvent({
      eventType: "rate_limit_hit",
      actor: null,
      request,
      details: `Exceeded ${CANCEL_MAX_ATTEMPTS} self-service cancel attempts within 15 minutes.`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Too many attempts. Please try again in a bit." },
      { status: 429 }
    );
  }

  let payload;
  try {
    payload = cancelSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Please enter your reference code." },
      { status: 400 }
    );
  }

  try {
    const booking = await prisma.booking.findUnique({
      where: { referenceCode: payload.referenceCode.toUpperCase() },
      select: {
        id: true,
        status: true,
        guestName: true,
        guestEmail: true,
        referenceCode: true,
        checkInDate: true,
        checkOutDate: true,
        directionsMapImageKey: true,
      },
    });

    if (!booking || (booking.status !== "confirmed" && booking.status !== "pending")) {
      return NextResponse.json(
        { success: false, data: null, message: "That reference code wasn't found or is no longer active." },
        { status: 404 }
      );
    }

    // Hard delete — not a soft-cancel — so the dates are immediately
    // and unambiguously free again, with nothing left in the table for
    // any status-based check to consider.
    await prisma.booking.delete({ where: { id: booking.id } });

    // Delete the saved route PNG from Cloudflare R2 (Rule 35.6) so a
    // deleted booking doesn't leave an orphaned image behind. Never
    // let a failed R2 delete block the cancellation itself — the row
    // is already gone.
    if (booking.directionsMapImageKey) {
      try {
        await deleteFromR2(booking.directionsMapImageKey);
      } catch (error) {
        console.error("[api/bookings/manage/cancel] Failed to delete R2 directions image:", error.message);
      }
    }

    // Audit trail — a guest just permanently removed a booking record
    // via reference code, worth a security log entry same as any other
    // data-deleting action, even though no admin session was involved.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: `guest:${booking.guestEmail || booking.referenceCode}`,
      request,
      details: `Guest self-service cancelled and deleted booking ${booking.referenceCode} (${booking.checkInDate
        .toISOString()
        .slice(0, 10)} – ${booking.checkOutDate.toISOString().slice(0, 10)}).`,
    });

    // Best-effort cancellation email — never blocks the cancellation
    // itself, same pattern as the booking-confirmation email in
    // app/api/bookings/route.js.
    if (booking.guestEmail) {
      try {
        // Admin-editable copy (super-admin > Content > Booking Email
        // Templates > Booking Cancelled).
        const [cancelledTemplate, resortName] = await Promise.all([
          getOrCreateEmailTemplate("cancelled"),
          getResortDisplayName(),
        ]);
        const mergeVars = { guestName: booking.guestName };

        await sendGeneralEmail({
          toEmail: booking.guestEmail,
          subject: `${resortName} — Booking Cancelled (${booking.referenceCode})`,
          eyebrow: renderTemplateText(cancelledTemplate.eyebrowText, mergeVars),
          heading: renderTemplateText(cancelledTemplate.headingText, mergeVars),
          intro: renderTemplateText(cancelledTemplate.introMessage, mergeVars),
          highlightLine1: `Reference code: ${booking.referenceCode}`,
          highlightLine2: `${FULL_DATE.format(booking.checkInDate)} → ${FULL_DATE.format(booking.checkOutDate)}`,
          bodyMessage: renderTemplateText(cancelledTemplate.bodyMessage, mergeVars),
          emailType: "booking_cancelled",
          relatedBookingId: booking.id,
        });
      } catch (error) {
        console.error("[api/bookings/manage/cancel] Failed to send cancellation email:", error.message);
      }
    }

    return NextResponse.json({
      success: true,
      data: null,
      message: "Your booking has been cancelled.",
    });
  } catch (error) {
    console.error("[api/bookings/manage/cancel] Failed to cancel booking:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to cancel your booking. Please try again or call us." },
      { status: 500 }
    );
  }
}
