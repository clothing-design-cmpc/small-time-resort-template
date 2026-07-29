/**
 * FILE: app/api/bookings/manage/cancel/route.js
 * ROLE: Public — no auth required, called by the visitor "Manage My
 *       Booking" floating widget (components/shared/ManageBookingWidget.jsx)
 *
 * PURPOSE:
 * Self-service cancellation: a guest who supplies a valid, still-
 * confirmed reference code can cancel their own booking directly —
 * same soft-cancel (status -> "cancelled") the super-admin's Bookings
 * page "Cancel booking" action performs
 * (app/api/admin/bookings/[id]/route.js's PATCH), just reached by
 * reference code instead of an admin session.
 *
 * DATA FLOW:
 * 1. Widget POSTs { referenceCode } after the guest confirms in-modal
 * 2. Rate limited to 10 attempts per 15 minutes per IP (Rule 32.1) —
 *    same limiter family as lookup/verify-reference, since this is
 *    just as sensitive an action gated by the same credential
 * 3. Only a "confirmed" booking can be cancelled this way — already-
 *    cancelled or unknown codes get a friendly, non-revealing message
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/services/prisma";
import { checkRateLimit } from "@/services/rateLimit";
import { logSecurityEvent } from "@/services/securityLog";
import { deleteFromR2 } from "@/services/r2";

const CANCEL_MAX_ATTEMPTS = 10;
const CANCEL_WINDOW_MS = 15 * 60 * 1000;

const cancelSchema = z.object({
  referenceCode: z.string().trim().min(1).max(40),
});

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
      select: { id: true, status: true, guestName: true, directionsMapImageKey: true },
    });

    if (!booking || booking.status !== "confirmed") {
      return NextResponse.json(
        { success: false, data: null, message: "That reference code wasn't found or is already cancelled." },
        { status: 404 }
      );
    }

    await prisma.booking.update({
      where: { id: booking.id },
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
    if (booking.directionsMapImageKey) {
      try {
        await deleteFromR2(booking.directionsMapImageKey);
      } catch (error) {
        console.error("[api/bookings/manage/cancel] Failed to delete R2 directions image:", error.message);
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
