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
 * 4. Returns { valid: true, guestFirstName } or { valid: false }
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/services/prisma";
import { checkRateLimit } from "@/services/rateLimit";
import { logSecurityEvent } from "@/services/securityLog";

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
    select: { id: true, guestName: true, status: true },
  });

  const isValid = !!booking && booking.status === "confirmed";

  if (!isValid) {
    return NextResponse.json({
      success: true,
      data: { valid: false },
      message: "That reference code wasn't found. Please check your invoice and try again.",
    });
  }

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
