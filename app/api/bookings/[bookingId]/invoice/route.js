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
 * 2. Booking is looked up by id (+ its room, for the invoice layout)
 * 3. generateInvoicePdf() builds the PDF buffer
 * 4. Response is sent with Content-Disposition so the browser downloads
 *    it as "invoice-<referenceCode>.pdf" instead of navigating to it
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { generateInvoicePdf } from "@/services/invoicePdf";
import { checkRateLimit } from "@/services/rateLimit";

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
    include: { room: { select: { name: true } } },
  });

  if (!booking) {
    return NextResponse.json({ success: false, data: null, message: "Booking not found." }, { status: 404 });
  }

  let pdfBuffer;
  try {
    pdfBuffer = await generateInvoicePdf(booking);
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
