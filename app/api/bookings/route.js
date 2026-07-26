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
 *
 * RACE-CONDITION FIX (deep search Section 2):
 * Step 3's overlap re-check and step 4's insert now run inside ONE
 * Serializable Postgres transaction (see createBookingInTransaction
 * below), so a concurrent request for the same room/dates can't slip
 * between the read and the write. On top of that, prisma/
 * addBookingExclusionConstraint.js adds a database-level EXCLUDE
 * constraint that physically rejects an overlapping confirmed booking
 * even if the app-level check above were ever bypassed — that DB
 * constraint is the real guarantee; this transaction is defense in
 * depth on top of it, not a replacement for it.
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
import { triggerGatekeeperBreach } from "@/services/breachResponse";
import { generateUniqueReferenceCode } from "@/services/referenceCode";
import { sendGeneralEmail } from "@/services/emailjs";
import { isExclusionViolation, isSerializationFailure } from "@/services/pgErrorCodes";

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

const MAX_SERIALIZATION_RETRIES = 1;

/**
 * createBookingInTransaction
 * Runs the authoritative rule/overlap re-check (validateAndQuoteBooking)
 * and the booking insert inside ONE Serializable Postgres transaction, so
 * a concurrent request for the same room and dates can never read "no
 * overlap" and then write in between this request's own read and write.
 * Retries exactly once on a serialization failure (SQLSTATE 40001) —
 * Postgres aborting one of two genuinely conflicting transactions is
 * expected, correct behavior under Serializable isolation, not a bug.
 */
async function createBookingInTransaction(payload, attempt = 0) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        // client: tx makes every read inside validateAndQuoteBooking part
        // of this same transaction — required for Serializable isolation
        // to actually protect this overlap check (see services/bookingPricing.js).
        const quote = await validateAndQuoteBooking({ ...payload, client: tx });

        // Generated inside the same transaction as the insert (both against
        // `tx`) so the uniqueness check and the write see a consistent view.
        const referenceCode = await generateUniqueReferenceCode(tx);

        const booking = await tx.booking.create({
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
            // Nights actually selected — matches BookingRule.howManySelectedDates
            // so it's clear afterward which specific rule set (e.g.
            // "4Ds-3Ns") priced this booking. See services/bookingPricing.js.
            howManySelectedDates: quote.howManySelectedDates,
            notes: payload.notes || null,
            status: "confirmed",
            referenceCode,
          },
        });

        return { booking, quote };
      },
      { isolationLevel: "Serializable" }
    );
  } catch (error) {
    if (isSerializationFailure(error) && attempt < MAX_SERIALIZATION_RETRIES) {
      return createBookingInTransaction(payload, attempt + 1);
    }
    throw error;
  }
}

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkRateLimit(`booking:${ip}`, BOOKING_SUBMIT_MAX, BOOKING_SUBMIT_WINDOW_MS);
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

    // GATEKEEPER 2 TRIPPED — same attack-pattern signal as the login
    // route, just on the public booking form instead.
    if (ip !== "unknown") {
      await triggerGatekeeperBreach({
        gatekeeper: 2,
        ipAddress: ip,
        details: `SQL injection pattern detected in field "${sqliHit}" on booking submission.`,
      }).catch((error) => console.error("[bookings] Gatekeeper 2 breach response failed:", error.message));
    }

    return NextResponse.json(
      { success: false, data: null, message: "Please check the booking form for errors." },
      { status: 400 }
    );
  }

  let bookingResult;
  try {
    bookingResult = await createBookingInTransaction(payload);
  } catch (error) {
    // Either guard rejected this booking because another guest just took
    // the same room/dates — the DB-level EXCLUDE constraint (23P01) or
    // the Serializable transaction's own conflict detection (40001, after
    // its one retry already failed). Same friendly message either way.
    if (isExclusionViolation(error) || isSerializationFailure(error)) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: "Sorry, this room was just booked for those dates. Please choose different dates.",
        },
        { status: 409 }
      );
    }

    // A genuine, unexpected database/Prisma error — never expose the raw
    // message to the guest (Rule 18.2).
    if (typeof error?.name === "string" && error.name.startsWith("PrismaClient")) {
      console.error("[api/bookings] Failed to create booking:", error.message);
      return NextResponse.json(
        { success: false, data: null, message: "We couldn't complete your booking. Please try again." },
        { status: 500 }
      );
    }

    // Otherwise this is one of validateAndQuoteBooking's plain rule-violation
    // Errors (invalid dates, room inactive, blackout hit, etc.) — same 400
    // behavior as before this fix.
    return NextResponse.json(
      { success: false, data: null, message: error.message },
      { status: 400 }
    );
  }

  const { booking, quote } = bookingResult;

  try {
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
  } catch (error) {
    // Logging must never break a successful booking — just note it and move on.
    console.error("[api/bookings] Failed to log visitor activity:", error.message);
  }

  try {
    // Best-effort confirmation email — carries the reference code the
    // guest needs for the invoice PDF and, later, the gated Directions
    // widget (villa-azure-ai-insight-and-directions-plan.txt, Part 2).
    // A failed send must never fail an already-confirmed booking.
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    const invoiceUrl = siteUrl ? `${siteUrl}/api/bookings/${booking.id}/invoice` : null;
    await sendGeneralEmail({
      toEmail: payload.guestEmail,
      subject: `Villa Azure Resort — Booking Confirmed (${booking.referenceCode})`,
      eyebrow: "BOOKING CONFIRMED",
      heading: `Thank you, ${payload.guestName}!`,
      intro:
        "Your stay at Villa Azure Resort has been confirmed. Keep your reference code below — you'll need it to unlock turn-by-turn directions to the resort.",
      highlightLine1: `Reference code: ${booking.referenceCode}`,
      highlightLine2: `${quote.checkInDate} → ${quote.checkOutDate}`,
      bodyMessage: invoiceUrl
        ? `Download your invoice here: ${invoiceUrl}`
        : "Your invoice with the reference code above is also available on the booking confirmation page.",
    });
  } catch (error) {
    console.error("[api/bookings] Failed to send confirmation email:", error.message);
  }

  return NextResponse.json({
    success: true,
    data: { booking, quote },
    message: "Booking confirmed! We'll see you soon.",
  });
}
