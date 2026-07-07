/**
 * FILE: components/sections/CTASection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Final homepage call-to-action block before the footer.
 * Centered copy + two buttons: Book Now and View Rooms.
 * High-contrast surface so it reads as a visual anchor at the
 * bottom of the page.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx after TestimonialsSection
 * 2. No data fetching — fully static
 */
import Link from "next/link";
import "./CTASection.css";

export default function CTASection() {
  return (
    <section className="ctaSection">
      <div className="ctaContainer">
        <span className="ctaEyebrow">Ready to Book?</span>
        <h2 className="ctaTitle">Reserve Your Villa</h2>
        <p className="ctaBody">
          A handful of villas, a small team, and a shoreline that stays quiet.
          Send us an inquiry and we&apos;ll get back to you within 24 hours.
        </p>
        <div className="ctaActions">
          <Link href="/visitor/booking" className="ctaButtonPrimary">
            Book Your Stay
          </Link>
          <Link href="/visitor/rooms" className="ctaButtonSecondary">
            View Rooms &amp; Villas
          </Link>
        </div>
      </div>
    </section>
  );
}
