/**
 * FILE: app/visitor/booking/page.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Real booking entry point for the "Book Now" header CTA and the
 * homepage Availability calendar (HowToBookSection). Branches into one
 * of three experiences depending on how the visitor arrived:
 *   - type is "day_tour" / "night_tour" (TourSelectionModal's Tour
 *     choice for a single selected date, room already picked in
 *     RoomSelectionModal just before it) -> TourReservationSummaryClient,
 *     a read-only package summary (date, tour time, room, flat room
 *     price) with only contact info left to fill in. Checked BEFORE
 *     roomId below — Day/Night Tour bookings now carry a roomId too
 *     (price follows the room — see services/bookingPricing.js), so
 *     roomId alone can no longer be used to infer "this is Overnight".
 *   - roomId present (and type isn't a tour type) -> ReservationSummaryClient,
 *     a read-only package summary + guest info form, no editable
 *     room/date/type selectors.
 *   - Neither present (the header's plain "Book Now" link) -> the
 *     original fully interactive BookingFormClient, unchanged.
 *
 * DATA FLOW:
 * 1. Visitor arrives here from Header's "Book Now" link (no query
 *    params), HowToBookSection's TourSelectionModal for a single-date
 *    Day/Night Tour choice (?checkin=&type=day_tour|night_tour&roomId=),
 *    or HowToBookSection's RoomSelectionModal / TourSelectionModal
 *    Overnight choice (?checkin=&checkout=&roomId=&ruleId=)
 * 2. All actual data fetching (room, rule, availability, quote,
 *    submission) happens client-side in whichever client component
 *    is rendered — this Server Component only forwards query params
 */
import BookingFormClient from "./BookingFormClient";
import ReservationSummaryClient from "./ReservationSummaryClient";
import TourReservationSummaryClient from "./TourReservationSummaryClient";
import { prisma } from "@/services/prisma";
import "./Booking.css";

// Shown on the confirmation panel so a guest who wants to cancel knows
// to call the resort directly — there's no self-service cancel/refund
// flow yet, so a phone call is the real path (see Section 35.2's
// resortPhone field, same one Footer.jsx already displays). Matches
// Footer.jsx's own placeholder text/number until the admin fills in
// the real number under Super-Admin > Policies & Content > Contact Info.
const PLACEHOLDER_PHONE = "+63 9XX XXX XXXX";

export const metadata = {
  title: "Book Your Stay | your-private-resort",
  description: "Reserve your stay at your-private-resort — pick your dates, and confirm your booking online.",
};

export default async function BookingPage({ searchParams }) {
  const params = await searchParams;
  const initialCheckInDate = typeof params?.checkin === "string" ? params.checkin : null;
  const initialCheckOutDate = typeof params?.checkout === "string" ? params.checkout : null;
  const roomId = typeof params?.roomId === "string" ? params.roomId : null;
  const ruleId = typeof params?.ruleId === "string" ? params.ruleId : null;
  // Set only when TourSelectionModal's Day Tour / Night Tour option was
  // picked for a single selected date — used below to route into
  // TourReservationSummaryClient instead of the full interactive form.
  // No longer gated on "!roomId" — Day/Night Tour bookings now carry a
  // roomId too (their price comes from that room's own flat rate), so
  // roomId alone can't distinguish a tour from an Overnight booking.
  const initialBookingType = typeof params?.type === "string" ? params.type : null;
  const isLockedTourType = initialBookingType === "day_tour" || initialBookingType === "night_tour";

  // .catch(() => null) means a DB hiccup falls back to the placeholder
  // number below instead of breaking the whole booking page.
  const settings = await prisma.systemSettings.findUnique({ where: { id: "singleton" } }).catch(() => null);
  const resortPhone = settings?.resortPhone || PLACEHOLDER_PHONE;
  // Used to build the "Confirm on Messenger" CTA on the pending
  // confirmation panel (no PayMongo integration yet — see
  // app/api/bookings/route.js and services/invoicePdf.js). Null falls
  // back to a "contact us directly" message instead of a broken link.
  const resortMessengerUsername = settings?.resortMessengerUsername || null;

  return (
    <section className="bookingSection">
      <div className="bookingContainer">
        <span className="bookingEyebrow">Reservations</span>
        <h1 className="bookingTitle">Book Your Stay</h1>
        <p className="bookingBody">
          {roomId || isLockedTourType
            ? "Review your reservation details below, then confirm."
            : "Pick your dates and confirm — no phone call needed."}
        </p>

        {isLockedTourType ? (
          <TourReservationSummaryClient
            checkInDate={initialCheckInDate}
            bookingType={initialBookingType}
            roomId={roomId}
            resortPhone={resortPhone}
            resortMessengerUsername={resortMessengerUsername}
          />
        ) : roomId ? (
          <ReservationSummaryClient
            checkInDate={initialCheckInDate}
            checkOutDate={initialCheckOutDate}
            roomId={roomId}
            ruleId={ruleId}
            resortPhone={resortPhone}
            resortMessengerUsername={resortMessengerUsername}
          />
        ) : (
          <BookingFormClient
            initialCheckInDate={initialCheckInDate}
            initialCheckOutDate={initialCheckOutDate}
            initialBookingType={initialBookingType}
            resortPhone={resortPhone}
            resortMessengerUsername={resortMessengerUsername}
          />
        )}
      </div>
    </section>
  );
}