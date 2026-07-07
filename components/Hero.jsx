/**
 * FILE: components/Hero.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * First section on the visitor homepage. Displays the resort name,
 * tagline, and a primary CTA that scrolls to the Contact/Inquiry
 * section. Background is a placeholder villa photo pulled from
 * Unsplash (free to use, no attribution required) — swap for real
 * resort photography in public/images/heroBackground.jpg once
 * Cloudflare R2 is connected, then replace the src below.
 *
 * DATA FLOW:
 * 1. Rendered as the first child inside app/visitor/page.jsx
 * 2. No data fetching — fully static content
 * 3. CTA anchors to "#contact", a section that will be added later
 */
import Image from "next/image";
import "./Hero.css";

export default function Hero() {
  return (
    <section className="heroSection">
      {/* Placeholder photo (Unsplash) — swap for real resort photography later */}
      <Image
        src="https://images.unsplash.com/photo-1759372945658-1e9f56e751bd?auto=format&fit=crop&w=2400&q=80"
        alt="Tropical villa with a private pool at twilight"
        fill
        priority
        className="heroBackgroundImage"
      />
      {/* Gradient overlay sits above the photo for text contrast */}
      <div className="heroOverlay" />

      <div className="heroContainer">
        <span className="heroEyebrow">A Private Escape</span>
        <h1 className="heroTitle">Villa Azure Resort</h1>
        <p className="heroSubtitle">
          Intimate villas, quiet shores, and a stillness that only comes with distance from everything else.
        </p>
        <div className="heroActions">
          <a className="heroCtaPrimary" href="#contact">
            Plan Your Stay
          </a>
          <a className="heroCtaSecondary" href="#rooms">
            Explore Rooms &amp; Villas
          </a>
        </div>
      </div>
    </section>
  );
}