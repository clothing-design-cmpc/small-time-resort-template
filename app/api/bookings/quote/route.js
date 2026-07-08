/**
 * FILE: app/api/bookings/quote/route.js
 * ROLE: Public — no auth required, called by the visitor booking form
 *
 * PURPOSE:
 * Previews the price + validity of a potential booking WITHOUT saving
 * anything, so the guest sees the total (and any rule violation) before
 * submitting. Uses the exact same validateAndQuoteBooking() the create
 * route uses, so the previewed number is guaranteed to match what gets
 * charged on submit.
 *
 * DATA FLOW:
 * 1. BookingFormClient calls this every time room/dates/guest count/
 *    booking type change (debounced client-side)
 * 2. Returns { success: false, message } with a 400 on any rule
 *    violation — the form renders that message inline, never a raw error
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { validateAndQuoteBooking } from "@/services/bookingPricing";

const quoteRequestSchema = z.object({
  roomId: z.string().uuid().nullable().optional(),
  bookingType: z.enum(["overnight", "day_tour", "night_tour"]),
  checkInDate: z.string().min(1),
  checkOutDate: z.string().nullable().optional(),
  numberOfGuests: z.coerce.number().int().min(1),
});

export async function POST(request) {
  let payload;
  try {
    payload = quoteRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "Please fill in the booking details correctly." },
      { status: 400 }
    );
  }

  try {
    const quote = await validateAndQuoteBooking(payload);
    return NextResponse.json({ success: true, data: quote, message: "Quote calculated." });
  } catch (ruleError) {
    // validateAndQuoteBooking throws plain Errors with guest-facing messages
    return NextResponse.json(
      { success: false, data: null, message: ruleError.message },
      { status: 400 }
    );
  }
}
