/**
 * FILE: app/api/bookings/route.js
 * ROLE: Public — no auth required, called by the visitor booking form
 *
 * PURPOSE:
 * Creates a "pending" Booking after re-validating every BookingRules
 * check server-side (never trusts the /api/bookings/quote preview
 * alone — a second guest could have taken the room in between). This
 * is the only place a Booking row actually gets written from the
 * visitor side. No PayMongo integration yet, so the booking is not
 * auto-confirmed: it holds its dates for the DP Countdown window while
 * the guest sends their invoice PDF to the resort's Facebook Page and
 * the owner approves it from Super-Admin > Bookings (see services/
 * bookingRules.js, services/invoicePdf.js, app/api/admin/bookings/
 * [id]/confirm/route.js, and app/api/cron/booking-expiry/route.js).
 *
 * DATA FLOW:
 * 1. BookingFormClient POSTs guest info + selected room/dates/type
 * 2. Rate limited to 10 submissions per 15 minutes per IP (Rule 32.1)
 * 3. Zod validates the request shape; validateAndQuoteBooking()
 *    re-runs every rule check + computes the authoritative price
 * 4. IP, user-agent, and city/country (self-hosted MaxMind lookup) are
 *    resolved server-side and stored directly on the Booking row
 *    (ipAddress/userAgent/geoCity/geoCountry) — never trusted from the
 *    request body — so an admin can see a specific booking's origin
 *    without cross-referencing VisitorLog's separate booking_submitted
 *    event by timestamp
 * 5. On success, inserts the Booking row and returns it plus the quote
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
import { lookupGeoLocation } from "@/services/geoip";
import { scanForSqlInjection } from "@/services/sqlInjectionGuard";
import { triggerGatekeeperBreach } from "@/services/breachResponse";
import { generateUniqueReferenceCode } from "@/services/referenceCode";
import { sendGeneralEmail } from "@/services/emailjs";
import { getOrCreateEmailTemplate, renderTemplateText } from "@/services/bookingEmailTemplates";
import { isExclusionViolation, isSerializationFailure } from "@/services/pgErrorCodes";
import { getGlobalPendingHoldHours } from "@/services/pendingHoldHours";

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
async function createBookingInTransaction(payload, requestMeta, pendingHoldHours, attempt = 0) {
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

        // --- Pending-Hold Countdown capping (see prisma/schema.prisma's
        // pendingHoldCapped field comment) ---
        // The full DP Countdown window (now + pendingHoldHours) is only
        // used as-is when this booking's scheduled start is comfortably
        // beyond it — e.g. an Overnight stay checking in tomorrow or
        // later. When the scheduled start (quote.scheduledStartAt) falls
        // sooner than that — a Day/Night Tour booked an hour or two
        // before its own start time — the hold is capped to end exactly
        // at the scheduled start instead, since holding a room "pending"
        // past its own start time makes no sense. The cron sweep reads
        // pendingHoldCapped to know this booking must NOT auto-expire
        // once that shorter window passes.
        const fullExpiresAt = new Date(Date.now() + pendingHoldHours * 60 * 60 * 1000);
        const scheduledStartAt = new Date(quote.scheduledStartAt);
        const pendingHoldCapped = scheduledStartAt.getTime() < fullExpiresAt.getTime();
        const pendingExpiresAt = pendingHoldCapped ? scheduledStartAt : fullExpiresAt;

        const booking = await tx.booking.create({
          data: {
            roomId: payload.roomId || null,
            guestName: payload.guestName,
            guestEmail: payload.guestEmail,
            guestPhone: payload.guestPhone,
            numberOfGuests: payload.numberOfGuests,
            bookingType: payload.bookingType,
            // Parsed with a "Z" suffix so this is always read as UTC
            // midnight, never the server's local timezone. Without "Z",
            // "YYYY-MM-DDT00:00:00" is parsed as LOCAL midnight — on a
            // server running in a UTC+8 timezone (e.g. Asia/Manila),
            // local midnight July 27 is 2026-07-26T16:00:00Z, and the
            // @db.Date column then stores July 26 (the UTC date part),
            // one day earlier than what the guest actually selected.
            checkInDate: new Date(`${quote.checkInDate}T00:00:00Z`),
            checkOutDate: new Date(`${quote.checkOutDate}T00:00:00Z`),
            totalAmount: quote.total,
            depositAmount: quote.depositAmount,
            // Nights actually selected — matches BookingRule.howManySelectedDates
            // so it's clear afterward which specific rule set (e.g.
            // "4Ds-3Ns") priced this booking. See services/bookingPricing.js.
            howManySelectedDates: quote.howManySelectedDates,
            // Only non-null when the active rule's Same-Day Check-In
            // Policy is "auto_adjust" and this booking was submitted
            // today after the rule's normal start time — see
            // services/bookingPricing.js. Null otherwise, meaning the
            // rule's own checkInTime/checkOutTime (or tour start/end
            // times) apply unchanged.
            effectiveCheckInAt: quote.effectiveCheckInAt ? new Date(quote.effectiveCheckInAt) : null,
            effectiveCheckOutAt: quote.effectiveCheckOutAt ? new Date(quote.effectiveCheckOutAt) : null,
            // Snapshots the Cleaning Hours that governed THIS booking at
            // creation time — see prisma/schema.prisma's field comment
            // and services/bookingPricing.js's turnover conflict check.
            cleaningHoursSnapshot: quote.cleaningHours,
            notes: payload.notes || null,
            // No PayMongo integration yet — every new booking starts
            // "pending" and holds its dates for the DP Countdown window
            // (SystemSettings.pendingHoldHours, resolved above — see
            // services/pendingHoldHours.js) while the guest is
            // expected to confirm via Messenger (invoice PDF's PENDING
            // watermark + instructions — services/invoicePdf.js) and
            // the owner approves it from Super-Admin > Bookings
            // (app/api/admin/bookings/[id]/confirm/route.js). If it's
            // never confirmed in time, app/api/cron/booking-expiry/
            // route.js flips it to "expired" and frees the dates.
            status: "pending",
            // Computed ONCE, right now, from whatever the DP Countdown
            // setting (SystemSettings.pendingHoldHours) currently is, and
            // saved directly on this row. If a super-admin changes that
            // setting later, THIS booking's hold window never moves —
            // see services/pendingHoldHours.js for why that's safe. May be
            // capped short of the full window — see pendingHoldCapped above.
            pendingExpiresAt,
            pendingHoldCapped,
            referenceCode,
            // Device/location capture — resolved server-side before this
            // transaction started (see POST handler below), never trusted
            // from the request body.
            ipAddress: requestMeta.ipAddress,
            userAgent: requestMeta.userAgent,
            geoCity: requestMeta.geoCity,
            geoCountry: requestMeta.geoCountry,
          },
        });

        return { booking, quote };
      },
      { isolationLevel: "Serializable" }
    );
  } catch (error) {
    if (isSerializationFailure(error) && attempt < MAX_SERIALIZATION_RETRIES) {
      return createBookingInTransaction(payload, requestMeta, pendingHoldHours, attempt + 1);
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
  // Hoisted to function scope (not just inside the try block below) —
  // the confirmation-email try block further down also needs this same
  // value for its mergeVars. It was previously declared with `const`
  // inside that first try block, which made it inaccessible there and
  // threw "pendingHoldHours is not defined" on every booking submit.
  let pendingHoldHours;
  try {
    // Resolved once, before the transaction — geolocation is a local
    // MaxMind read (services/geoip.js), never blocking or external, but
    // there's no reason to run it inside the Serializable transaction.
    const userAgent = request.headers.get("user-agent") ?? null;
    const location = await lookupGeoLocation(ip);
    const requestMeta = {
      ipAddress: ip !== "unknown" ? ip : null,
      userAgent,
      geoCity: location.city,
      geoCountry: location.countryCode,
    };

    // Resolved once, before the transaction, same as requestMeta above —
    // this is the DP Countdown value THIS booking will be held for. See
    // services/pendingHoldHours.js for why reading it here (rather than
    // re-reading it later) is what makes a super-admin's later change to
    // this setting safe to apply mid-flight.
    pendingHoldHours = await getGlobalPendingHoldHours();

    bookingResult = await createBookingInTransaction(payload, requestMeta, pendingHoldHours);
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
    const directionsUrl = siteUrl ? `${siteUrl}/visitor/directions` : null;

    // Admin-editable copy (super-admin > Content > Booking Email
    // Templates > Booking Pending). Merge tags are filled in below
    // before this text is sent — see services/bookingEmailTemplates.js.
    const pendingTemplate = await getOrCreateEmailTemplate("pending");
    const mergeVars = { guestName: payload.guestName, pendingHoldHours };

    await sendGeneralEmail({
      toEmail: payload.guestEmail,
      subject: `your-private-resort — Booking Request Received (${booking.referenceCode})`,
      eyebrow: renderTemplateText(pendingTemplate.eyebrowText, mergeVars),
      heading: renderTemplateText(pendingTemplate.headingText, mergeVars),
      intro: renderTemplateText(pendingTemplate.introMessage, mergeVars),
      highlightLine1: `Reference code: ${booking.referenceCode}`,
      highlightLine2: `${quote.checkInDate} → ${quote.checkOutDate}`,
      bodyMessage: [
        renderTemplateText(pendingTemplate.bodyMessage, mergeVars),
        invoiceUrl
          ? `Download your invoice (with confirmation instructions) here: ${invoiceUrl}`
          : "Your invoice with the reference code and confirmation instructions is also available on the booking page.",
        directionsUrl
          ? `Once your booking is confirmed, get turn-by-turn directions here: ${directionsUrl} (enter your reference code when prompted).`
          : null,
        siteUrl
          ? `Need to change or cancel? Go to ${siteUrl}/visitor, click the "Cancellation" icon at the bottom-right of the screen, then enter your reference code (${booking.referenceCode}) there.`
          : `Need to change or cancel? Go to our homepage, click the "Cancellation" icon at the bottom-right of the screen, then enter your reference code (${booking.referenceCode}) there.`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      emailType: "booking_pending",
      relatedBookingId: booking.id,
    });
  } catch (error) {
    console.error("[api/bookings] Failed to send confirmation email:", error.message);
  }

  return NextResponse.json({
    success: true,
    data: { booking, quote },
    message: "Booking request received! Send your invoice on Messenger to confirm your dates.",
  });
}