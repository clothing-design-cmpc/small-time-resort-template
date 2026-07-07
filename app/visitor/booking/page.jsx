/**
 * FILE: app/visitor/booking/page.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Landing page for the "Book Now" CTA in the site Header. Booking
 * functionality itself is not built yet — this page exists so the
 * link resolves instead of 404ing, per the master template plan
 * (Booking is scaffolded after Rooms & Villas, per overviewProject.txt).
 *
 * DATA FLOW:
 * 1. Visitor clicks "Book Now" in components/shared/Header.jsx
 * 2. This Server Component renders a static holding message
 * 3. Once the booking form/flow is built, this file becomes its entry point
 */
import "./Booking.css";

export const metadata = {
  title: "Book Your Stay | Villa Azure Resort",
  description: "Reserve your stay at Villa Azure Resort.",
};

export default function BookingPage() {
  return (
    <section className="bookingSection">
      <div className="bookingContainer">
        <span className="bookingEyebrow">Reservations</span>
        <h1 className="bookingTitle">Book Your Stay</h1>
        <p className="bookingBody">
          Online booking is being finalized. In the meantime, reach out
          through our Contact page and our team will help you reserve
          your villa directly.
        </p>
      </div>
    </section>
  );
}
