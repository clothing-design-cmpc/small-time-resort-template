/**
 * FILE: app/api/bookings/verify-reference/route.js
 * ROLE: Public — no auth required, called by the visitor "How to Get
 *       There" widget (app/visitor/directions/DirectionsClient.jsx)
 *
 * PURPOSE:
 * Checks whether a reference code typed in by a visitor matches a real,
 * still-valid booking (villa-azure-ai-insight-and-directions-plan.txt,
 * Part 2, step 5). This is the gate that must pass before the
 * Directions widget is allowed to reveal anything — it never returns
 * the full Booking row, only a boolean plus the minimal fields the
 * widget needs (guest first name, for a friendly greeting).
 *
 * DATA FLOW:
 * 1. DirectionsClient POSTs { referenceCode }
 * 2. Rate limited to 10 attempts per 15 minutes per IP (Rule 32.1 /
 *    plan's "Security/abuse-prevention" requirement) — prevents
 *    brute-forcing reference codes even though the code space is huge
 * 3. Booking looked up by referenceCode; valid only if status is
 *    "confirmed" (a cancelled booking's code no longer works)
 * 4. A confirmed booking's checkInDate is also checked against
 *    getDirectionsAvailability() (services/directions.js) — the widget
 *    stays locked until 1 day before check-in even for a real,
 *    confirmed booking, so guests can't preview directions months out
 * 5. Returns { valid: true, guestFirstName } or { valid: false }
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/services/prisma";
import { checkRateLimit } from "@/services/rateLimit";
import { logSecurityEvent } from "@/services/securityLog";
import { getDirectionsAvailability } from "@/services/directions";

const VERIFY_MAX_ATTEMPTS = 10;
const VERIFY_WINDOW_MS = 15 * 60 * 1000;

const verifySchema = z.object({
  referenceCode: z.string().trim().min(1).max(40),
});

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkRateLimit(`verify-reference:${ip}`, VERIFY_MAX_ATTEMPTS, VERIFY_WINDOW_MS);
  if (!allowed) {
    await logSecurityEvent({
      eventType: "rate_limit_hit",
      actor: null,
      request,
      details: `Exceeded ${VERIFY_MAX_ATTEMPTS} reference code attempts within 15 minutes.`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Too many attempts. Please try again in a bit." },
      { status: 429 }
    );
  }

  let payload;
  try {
    payload = verifySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Please enter your reference code." },
      { status: 400 }
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { referenceCode: payload.referenceCode.toUpperCase() },
    select: { id: true, guestName: true, status: true, checkInDate: true, directionsAccessedAt: true },
  });

  const isValid = !!booking && booking.status === "confirmed";

  if (!isValid) {
    return NextResponse.json({
      success: true,
      data: { valid: false },
      message: "That reference code wasn't found. Please check your invoice and try again.",
    });
  }

  // Single-use gate — directions were already retrieved for this
  // booking at some earlier point (any device), so the widget stays
  // locked from here on. The map already embedded in the invoice
  // (services/invoicePdf.js) is the guest's reference from now on —
  // this is exactly why that map matters, since this is the only
  // place a route image gets shown after the one-time unlock.
  if (booking.directionsAccessedAt) {
    await logSecurityEvent({
      eventType: "directions_reuse_blocked",
      actor: booking.guestName,
      request,
      details: `Reference code reused after directions already accessed at ${booking.directionsAccessedAt.toISOString()}.`,
    });
    return NextResponse.json({
      success: true,
      data: { valid: false, alreadyUsed: true },
      message: "Directions for this booking were already retrieved. Please check the map on your invoice, or contact us if you need help.",
    });
  }

  // Real, confirmed booking — but Directions stays locked until 1 day
  // before check-in. Log the attempt's IP so the super-admin has
  // visibility into early-access attempts, same pattern as the
  // rate_limit_hit logging above.
  const { available, availableFrom } = getDirectionsAvailability(booking.checkInDate);
  if (!available) {
    await logSecurityEvent({
      eventType: "directions_denied_early",
      actor: null,
      request,
      details: `Reference code verified but too early for directions (check-in ${booking.checkInDate.toISOString().slice(0, 10)}).`,
    });
    return NextResponse.json({
      success: true,
      data: { valid: false, availableFrom: availableFrom.toISOString() },
      message: `Directions open starting ${availableFrom.toISOString().slice(0, 10)} — please check back closer to your visit.`,
    });
  }

  // Real, confirmed booking, and inside the availability window — log
  // the SUCCESSFUL verification itself (not just the denial branch
  // above), so the super-admin actually sees that this device's IP/
  // location/fingerprint was captured for a real directions access,
  // instead of Security Logs only ever showing the failure cases.
  await logSecurityEvent({
    eventType: "directions_verified",
    actor: booking.guestName,
    request,
    details: `Reference code verified for directions (check-in ${booking.checkInDate.toISOString().slice(0, 10)}).`,
  });

  return NextResponse.json({
    success: true,
    data: {
      valid: true,
      bookingId: booking.id,
      guestFirstName: booking.guestName.split(" ")[0],
    },
    message: "Reference code verified.",
  });
}
