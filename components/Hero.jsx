/**
 * FILE: components/Hero.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * First section on the visitor homepage. Displays the resort name,
 * tagline, and a primary CTA that scrolls to the Contact/Inquiry
 * section. Uses a layered gradient background instead of a photo —
 * drop a real photo into public/images/heroBackground.jpg and swap
 * the CSS background in Hero.css for next/image + a positioned
 * background layer once photography is available.
 *
 * DATA FLOW:
 * 1. Rendered as the first child inside app/visitor/page.jsx
 * 2. No data fetching — fully static content
 * 3. CTA anchors to "#contact", a section that will be added later
 */
import "./Hero.css";

export default function Hero() {
  return (
    <section className="heroSection">
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
