/**
 * FILE: app/api/bookings/[bookingId]/invoice/route.js
 * ROLE: Public — no auth required, called by the visitor booking
 *       confirmation panel right after a successful submit.
 *
 * PURPOSE:
 * Streams back the generated invoice PDF for one booking (services/
 * invoicePdf.js) as a downloadable file. Guarded by the booking's own
 * UUID (unguessable) plus a light rate limit — this route intentionally
 * stays public since the confirmation panel needs it immediately after
 * a guest submits a booking, before any login/session exists.
 *
 * DATA FLOW:
 * 1. BookingFormClient's confirmation panel links to this route using
 *    the booking id it just got back from POST /api/bookings
 * 2. Booking is looked up by id (+ its room, for the invoice layout);
 *    SystemSettings.resortLatitude/Longitude is also read here so the
 *    PDF can embed the resort's fixed location pin (Static Maps API,
 *    via services/directions.js) — always the same pin, never a
 *    guessed route, so it never conflicts with the real route image
 *    the guest later gets (and which is cached to R2) on the gated
 *    /visitor/directions page. The PDF instead links to that page and
 *    explains how to unlock it with the reference code.
 * 3. generateInvoicePdf() builds the PDF buffer
 * 4. Response is sent with Content-Disposition so the browser downloads
 *    it as "invoice-<referenceCode>.pdf" instead of navigating to it
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { generateInvoicePdf } from "@/services/invoicePdf";
import { checkRateLimit } from "@/services/rateLimit";
import { getActiveBookingRuleForDateCount, resolvePackageInclusions } from "@/services/bookingRules";

const INVOICE_DOWNLOAD_MAX = 20;
const INVOICE_DOWNLOAD_WINDOW_MS = 15 * 60 * 1000;

export async function GET(request, { params }) {
  const { bookingId } = await params;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkRateLimit(`invoice:${ip}`, INVOICE_DOWNLOAD_MAX, INVOICE_DOWNLOAD_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, data: null, message: "Too many invoice requests. Please try again in a bit." },
      { status: 429 }
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { room: { select: { name: true, amenityIds: true } } },
  });

  if (!booking) {
    return NextResponse.json({ success: false, data: null, message: "Booking not found." }, { status: 404 });
  }

  // Resort pin coordinates for the invoice's location map (services/
  // invoicePdf.js). A missing settings row degrades to no map on the
  // PDF — never blocks the invoice download itself.
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "singleton" },
    select: {
      resortLatitude: true,
      resortLongitude: true,
      resortMessengerUsername: true,
      siteTitle: true,
      brandAccentColor: true,
    },
  });

  // Resolve which package (BookingRule) actually priced this booking, so
  // the invoice can list what's included — same matching logic the
  // booking flow itself used at submission time (bookingType +
  // howManySelectedDates). Never blocks the invoice: a lookup failure
  // just means that source contributes nothing to the list.
  const matchedRule = await getActiveBookingRuleForDateCount(
    booking.bookingType,
    booking.howManySelectedDates
  ).catch(() => null);
  const ruleInclusions = await resolvePackageInclusions(matchedRule).catch(() => []);

  // The room's OWN amenities (Room.amenityIds) are a separate inclusion
  // source from the BookingRule's — this is what app/api/bookings/manage/
  // lookup/route.js and app/api/rooms/[roomId]/route.js already show the
  // guest as "Included" before and after booking. The invoice previously
  // only listed BookingRule-level inclusions and never these, so a guest
  // could see one set of inclusions everywhere else in the app and a
  // different (or empty) set on the invoice PDF. Room amenities are
  // listed first — they're what the guest saw when picking the room,
  // before rule-specific extras — and never blocks the invoice on a
  // lookup failure, same as ruleInclusions above.
  const roomAmenities = booking.room?.amenityIds?.length
    ? await prisma.amenity
        .findMany({ where: { id: { in: booking.room.amenityIds } }, select: { name: true } })
        .then((amenities) => amenities.map((a) => a.name))
        .catch(() => [])
    : [];

  const packageInclusions = [...new Set([...roomAmenities, ...ruleInclusions])];

  let pdfBuffer;
  try {
    pdfBuffer = await generateInvoicePdf(
      booking,
      {
        resortLatitude: settings?.resortLatitude ?? null,
        resortLongitude: settings?.resortLongitude ?? null,
        resortMessengerUsername: settings?.resortMessengerUsername ?? null,
        resortName: settings?.siteTitle ?? null,
        brandAccentColor: settings?.brandAccentColor ?? null,
      },
      packageInclusions
    );
  } catch (error) {
    console.error("[api/bookings/invoice] Failed to generate PDF:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't generate your invoice. Please try again." },
      { status: 500 }
    );
  }

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${booking.referenceCode}.pdf"`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
}