/**
 * FILE: app/api/bookings/route.js
 * ROLE: Public — no auth required, called by the visitor booking form
 *
 * PURPOSE:
 * Creates a confirmed Booking after re-validating every BookingRules
 * check server-side (never trusts the /api/bookings/quote preview
 * alone — a second guest could have taken the room in between). This
 * is the only place a Booking row actually gets written from the
 * visitor side.
 *
 * DATA FLOW:
 * 1. BookingFormClient POSTs guest info + selected room/dates/type
 * 2. Rate limited to 10 submissions per 15 minutes per IP (Rule 32.1)
 * 3. Zod validates the request shape; validateAndQuoteBooking()
 *    re-runs every rule check + computes the authoritative price
 * 4. On success, inserts the Booking row and returns it plus the quote
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/services/prisma";
import { validateAndQuoteBooking } from "@/services/bookingPricing";
import { checkRateLimit } from "@/services/rateLimit";
import { logSecurityEvent } from "@/services/securityLog";
import { logVisitorActivity } from "@/services/visitorLog";
import { scanForSqlInjection } from "@/services/sqlInjectionGuard";
import { requireLicensedRequest } from "@/services/licenseGuard";

const BOOKING_SUBMIT_MAX = 10;
const BOOKING_SUBMIT_WINDOW_MS = 15 * 60 * 1000;

const bookingRequestSchema = z.object({
  roomId: z.string().uuid().nullable().optional(),
  bookingType: z.enum(["overnight", "day_tour", "night_tour"]),
  checkInDate: z.string().min(1),
  checkOutDate: z.string().nullable().optional(),
  numberOfGuests: z.coerce.number().int().min(1),
  guestName: z.string().trim().min(2, "Enter the guest's full name.").max(120),
  guestEmail: z.string().trim().toLowerCase().email("Enter a valid email address."),
  guestPhone: z.string().trim().min(7, "Enter a valid phone number.").max(30),
  notes: z.string().trim().max(500).optional().default(""),
});

export async function POST(request) {
  // Independent enforcement point (see services/licenseGuard.js) --
  // even if the check in middleware.js is ever removed, booking
  // creation itself still refuses to run on an unlicensed domain.
  const licenseBlock = await requireLicensedRequest(request);
  if (licenseBlock) return licenseBlock;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = checkRateLimit(`booking:${ip}`, BOOKING_SUBMIT_MAX, BOOKING_SUBMIT_WINDOW_MS);
  if (!allowed) {
    await logSecurityEvent({
      eventType: "rate_limit_hit",
      actor: null,
      request,
      details: `Exceeded ${BOOKING_SUBMIT_MAX} booking attempts within 15 minutes.`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Too many booking attempts. Please try again in a bit." },
      { status: 429 }
    );
  }

  let payload;
  try {
    payload = bookingRequestSchema.parse(await request.json());
  } catch (validationError) {
    const firstIssue = validationError?.issues?.[0]?.message;
    return NextResponse.json(
      { success: false, data: null, message: firstIssue || "Please check the booking form for errors." },
      { status: 400 }
    );
  }

  // Defense-in-depth detection layer (Prisma already makes real SQL
  // injection structurally impossible — this just logs the attempt so
  // it shows up in Security Logs instead of silently failing zod validation).
  const sqliHit = scanForSqlInjection(payload);
  if (sqliHit) {
    await logSecurityEvent({
      eventType: "sql_injection_attempt",
      actor: typeof payload.guestEmail === "string" ? payload.guestEmail : null,
      request,
      details: `Suspicious pattern detected in field "${sqliHit}" on booking submission.`,
    });
    return NextResponse.json(
      { success: false, data: null, message: "Please check the booking form for errors." },
      { status: 400 }
    );
  }

  let quote;
  try {
    // Re-validates every BookingRules check and computes the authoritative
    // price — the same function the /quote preview endpoint uses.
    quote = await validateAndQuoteBooking(payload);
  } catch (ruleError) {
    return NextResponse.json(
      { success: false, data: null, message: ruleError.message },
      { status: 400 }
    );
  }

  try {
    const booking = await prisma.booking.create({
      data: {
        roomId: payload.roomId || null,
        guestName: payload.guestName,
        guestEmail: payload.guestEmail,
        guestPhone: payload.guestPhone,
        numberOfGuests: payload.numberOfGuests,
        bookingType: payload.bookingType,
        checkInDate: new Date(`${quote.checkInDate}T00:00:00`),
        checkOutDate: new Date(`${quote.checkOutDate}T00:00:00`),
        totalAmount: quote.total,
        depositAmount: quote.depositAmount,
        notes: payload.notes || null,
        status: "confirmed",
      },
    });

    // Records this as a notable visitor "transaction" — unlike routine
    // page views, this one runs the IP geolocation lookup since knowing
    // roughly where a real booking came from is useful for an admin.
    await logVisitorActivity({
      request,
      action: "booking_submitted",
      path: "/visitor/booking",
      details: `${payload.guestName} booked ${quote.checkInDate} to ${quote.checkOutDate}`,
      withLocation: true,
    });

    return NextResponse.json({
      success: true,
      data: { booking, quote },
      message: "Booking confirmed! We'll see you soon.",
    });
  } catch (error) {
    console.error("[api/bookings] Failed to create booking:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't complete your booking. Please try again." },
      { status: 500 }
    );
  }
}
