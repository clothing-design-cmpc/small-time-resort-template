/**
 * FILE: app/visitor/booking/page.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Real booking entry point for the "Book Now" header CTA and the
 * homepage Availability calendar (HowToBookSection). Branches into one
 * of three experiences depending on how the visitor arrived:
 *   - roomId present (HowToBookSection's RoomSelectionModal or
 *     TourSelectionModal's Overnight choice already confirmed a
 *     matching rule AND a room) -> ReservationSummaryClient, a
 *     read-only package summary + guest info form, no editable
 *     room/date/type selectors.
 *   - roomId absent but type is "day_tour" / "night_tour"
 *     (TourSelectionModal's Tour choice for a single selected date)
 *     -> TourReservationSummaryClient, the Tour equivalent: a
 *     read-only package summary (date, tour time, price per guest)
 *     with only guest count + contact info left to fill in.
 *   - Neither present (the header's plain "Book Now" link) -> the
 *     original fully interactive BookingFormClient, unchanged.
 *
 * DATA FLOW:
 * 1. Visitor arrives here from Header's "Book Now" link (no query
 *    params), HowToBookSection's TourSelectionModal for a single-date
 *    Day/Night Tour choice (?checkin=&type=day_tour|night_tour), or
 *    HowToBookSection's RoomSelectionModal / TourSelectionModal
 *    Overnight choice (?checkin=&checkout=&roomId=&ruleId=)
 * 2. All actual data fetching (room, rule, availability, quote,
 *    submission) happens client-side in whichever client component
 *    is rendered — this Server Component only forwards query params
 */
import BookingFormClient from "./BookingFormClient";
import ReservationSummaryClient from "./ReservationSummaryClient";
import TourReservationSummaryClient from "./TourReservationSummaryClient";
import "./Booking.css";

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
  const initialBookingType = typeof params?.type === "string" ? params.type : null;
  const isLockedTourType = !roomId && (initialBookingType === "day_tour" || initialBookingType === "night_tour");

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

        {roomId ? (
          <ReservationSummaryClient
            checkInDate={initialCheckInDate}
            checkOutDate={initialCheckOutDate}
            roomId={roomId}
            ruleId={ruleId}
          />
        ) : isLockedTourType ? (
          <TourReservationSummaryClient checkInDate={initialCheckInDate} bookingType={initialBookingType} />
        ) : (
          <BookingFormClient
            initialCheckInDate={initialCheckInDate}
            initialCheckOutDate={initialCheckOutDate}
            initialBookingType={initialBookingType}
          />
        )}
      </div>
    </section>
  );
}