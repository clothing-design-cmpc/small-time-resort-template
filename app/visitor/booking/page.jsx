/**
 * FILE: app/visitor/booking/page.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Real booking entry point for the "Book Now" header CTA and the
 * homepage's "Reserve Your Villa" date carousel. Replaces the old
 * static "coming soon" placeholder — this Server Component reads the
 * optional ?checkin= query param DateCarousel links with and passes it
 * to BookingFormClient as a pre-filled starting date.
 *
 * DATA FLOW:
 * 1. Visitor arrives here either from Header's "Book Now" link (no
 *    query param) or DateCarousel's "Continue with this date" link
 *    (?checkin=YYYY-MM-DD)
 * 2. All actual data fetching (rooms, booking rules, availability,
 *    quote, submission) happens client-side inside BookingFormClient —
 *    this Server Component only forwards the initial date
 */
import BookingFormClient from "./BookingFormClient";
import "./Booking.css";

export const metadata = {
  title: "Book Your Stay | Villa Azure Resort",
  description: "Reserve your stay at Villa Azure Resort — pick your dates, choose a villa, and confirm your booking online.",
};

export default async function BookingPage({ searchParams }) {
  const params = await searchParams;
  const initialCheckInDate = typeof params?.checkin === "string" ? params.checkin : null;

  return (
    <section className="bookingSection">
      <div className="bookingContainer">
        <span className="bookingEyebrow">Reservations</span>
        <h1 className="bookingTitle">Book Your Stay</h1>
        <p className="bookingBody">
          Pick your dates, choose a villa, and confirm — no phone call needed.
        </p>

        <BookingFormClient initialCheckInDate={initialCheckInDate} />
      </div>
    </section>
  );
}
