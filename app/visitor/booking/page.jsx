/**
 * FILE: app/visitor/booking/page.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Real booking entry point for the "Book Now" header CTA and the
 * homepage Availability calendar (HowToBookSection). Branches into one
 * of two experiences depending on how the visitor arrived:
 *   - roomId present (HowToBookSection's RoomSelectionModal already
 *     confirmed a matching rule AND a room) -> ReservationSummaryClient,
 *     a read-only text summary + guest info form, no editable
 *     room/date/type selectors.
 *   - roomId absent (the header's plain "Book Now" link, or a
 *     single-date Tour selection where booking type is still
 *     ambiguous — see HowToBookSection's file header) -> the original
 *     interactive BookingFormClient, unchanged.
 *
 * DATA FLOW:
 * 1. Visitor arrives here from Header's "Book Now" link (no query
 *    params), HowToBookSection's single-date Tour path (?checkin=
 *    only), or HowToBookSection's RoomSelectionModal (?checkin=&
 *    checkout=&roomId=&ruleId=)
 * 2. All actual data fetching (room, rule, availability, quote,
 *    submission) happens client-side in whichever client component
 *    is rendered — this Server Component only forwards query params
 */
import BookingFormClient from "./BookingFormClient";
import ReservationSummaryClient from "./ReservationSummaryClient";
import "./Booking.css";

export const metadata = {
  title: "Book Your Stay | Villa Azure Resort",
  description: "Reserve your stay at Villa Azure Resort — pick your dates, choose a villa, and confirm your booking online.",
};

export default async function BookingPage({ searchParams }) {
  const params = await searchParams;
  const initialCheckInDate = typeof params?.checkin === "string" ? params.checkin : null;
  const initialCheckOutDate = typeof params?.checkout === "string" ? params.checkout : null;
  const roomId = typeof params?.roomId === "string" ? params.roomId : null;
  const ruleId = typeof params?.ruleId === "string" ? params.ruleId : null;

  return (
    <section className="bookingSection">
      <div className="bookingContainer">
        <span className="bookingEyebrow">Reservations</span>
        <h1 className="bookingTitle">Book Your Stay</h1>
        <p className="bookingBody">
          {roomId
            ? "Review your reservation details below, then confirm."
            : "Pick your dates, choose a villa, and confirm — no phone call needed."}
        </p>

        {roomId ? (
          <ReservationSummaryClient
            checkInDate={initialCheckInDate}
            checkOutDate={initialCheckOutDate}
            roomId={roomId}
            ruleId={ruleId}
          />
        ) : (
          <BookingFormClient initialCheckInDate={initialCheckInDate} initialCheckOutDate={initialCheckOutDate} />
        )}
      </div>
    </section>
  );
}
