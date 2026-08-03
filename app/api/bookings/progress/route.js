/**
 * FILE: app/api/bookings/progress/route.js
 * ROLE: Public — no auth required, called by the visitor "Booking
 *       Progress" floating widget (components/shared/BookingProgressWidget.jsx)
 *
 * PURPOSE:
 * Read-only progress check: a guest enters their reference code and
 * gets back nothing except which stage their booking is in — never the
 * full package/pricing details app/api/bookings/manage/lookup/route.js
 * returns for the actual manage/cancel flow. Two stages only:
 *   - "pending"   -> still waiting on the guest's DP + receipt and the
 *                    owner's bank-transfer confirmation on Messenger
 *   - "confirmed" -> booked
 * Cancelled/expired/unknown codes get one flat "not active" message —
 * there is no progress left to show for those.
 *
 * DATA FLOW:
 * 1. Widget POSTs { referenceCode }
 * 2. Rate limited to 10 attempts per 15 minutes per IP — same limiter
 *    family as manage/lookup and manage/cancel (Rule 32.1), since the
 *    reference code is just as much a credential here
 * 3. Booking looked up by referenceCode; only status, createdAt, and
 *    pendingExpiresAt are read — nothing guest-identifying beyond the
 *    first name is ever returned
 * 4. hoursRemaining is computed server-side from pendingExpiresAt so
 *    the widget never has to do its own clock math against a value
 *    that could be stale by the time the guest reads it
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/services/prisma";
import { checkRateLimit } from "@/services/rateLimit";
import { logSecurityEvent } from "@/services/securityLog";

const PROGRESS_MAX_ATTEMPTS = 10;
const PROGRESS_WINDOW_MS = 15 * 60 * 1000;

const progressSchema = z.object({
  referenceCode: z.string().trim().min(1).max(40),
});

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkRateLimit(`booking-progress:${ip}`, PROGRESS_MAX_ATTEMPTS, PROGRESS_WINDOW_MS);
  if (!allowed) {
    await logSecurityEvent({
      eventType: "rate_limit_hit",
      actor: null,
      request,
      details: `Exceeded ${PROGRESS_MAX_ATTEMPTS} booking-progress lookup attempts within 15 minutes.`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Too many attempts. Please try again in a bit." },
      { status: 429 }
    );
  }

  let payload;
  try {
    payload = progressSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Please enter your reference code." },
      { status: 400 }
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { referenceCode: payload.referenceCode.toUpperCase() },
    select: {
      referenceCode: true,
      guestName: true,
      status: true,
      createdAt: true,
      pendingExpiresAt: true,
      pendingHoldCapped: true,
      pendingHoldBreachedAt: true,
    },
  });

  if (!booking) {
    return NextResponse.json({
      success: true,
      data: { found: false },
      message: "That reference code wasn't found. Please check your invoice and try again.",
    });
  }

  if (booking.status !== "pending" && booking.status !== "confirmed") {
    return NextResponse.json({
      success: true,
      data: { found: false },
      message: "This booking is no longer active (cancelled or expired).",
    });
  }

  // Hours left before the pending hold expires — clamped to 0 so a
  // booking that's technically past pendingExpiresAt but not yet swept
  // by app/api/cron/booking-expiry/route.js never shows a negative
  // number to the guest.
  const hoursRemaining =
    booking.status === "pending" && booking.pendingExpiresAt
      ? Math.max(0, Math.ceil((new Date(booking.pendingExpiresAt) - Date.now()) / (60 * 60 * 1000)))
      : null;

  return NextResponse.json({
    success: true,
    data: {
      found: true,
      referenceCode: booking.referenceCode,
      guestFirstName: booking.guestName.split(" ")[0],
      status: booking.status,
      hoursRemaining,
      pendingExpiresAt: booking.status === "pending" && booking.pendingExpiresAt
        ? booking.pendingExpiresAt.toISOString()
        : null,
      // True when this hold was capped to the booking's own scheduled
      // start (short-window, e.g. a Tour booked an hour or two before
      // it begins) — see prisma/schema.prisma's pendingHoldCapped
      // comment. The widget uses this to skip the "full countdown"
      // framing and never claim the hold auto-cancels.
      pendingHoldCapped: booking.status === "pending" ? booking.pendingHoldCapped : false,
      // Set once the capped hold above has passed without confirmation —
      // status stays "pending" (see app/api/cron/booking-expiry/route.js),
      // so the widget shows "waiting on the resort" instead of a
      // ticking-to-zero countdown.
      pendingHoldBreached: booking.status === "pending" && Boolean(booking.pendingHoldBreachedAt),
    },
    message: "Booking found.",
  });
}
