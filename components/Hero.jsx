/**
 * FILE: components/Hero.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * First section on the visitor homepage. Displays the resort name,
 * tagline, and CTA buttons.
 *
 * DATA FLOW:
 * 1. Rendered as the first child inside app/visitor/page.jsx
 * 2. Server Component reads the singleton SystemSettings row directly
 *    via Prisma (same pattern app/visitor/policies/page.jsx already
 *    uses) — heroTagline, heroImageUrl, and ctaButtonText are all
 *    editable by the super-admin under Content > Homepage
 * 3. Falls back to a placeholder Unsplash photo and default copy so
 *    this section is never blank before an admin uploads a hero image
 * 4. CTA anchors to "#contact", a section that will be added later
 */
import Image from "next/image";
import { prisma } from "@/services/prisma";
import "./Hero.css";

const DEFAULT_HERO_IMAGE =
  "https://images.unsplash.com/photo-1759372945658-1e9f56e751bd?auto=format&fit=crop&w=2400&q=80";

export default async function Hero() {
  // Read-only fetch of the singleton settings row the super-admin edits
  // under Content > Homepage. Fails safe to null so this public page
  // never 500s just because the row hasn't been created yet.
  const settings = await prisma.systemSettings.findUnique({ where: { id: "singleton" } }).catch(() => null);

  const heroImageUrl = settings?.heroImageUrl || DEFAULT_HERO_IMAGE;
  const heroTagline = settings?.heroTagline || "Experience Luxury";
  const ctaButtonText = settings?.ctaButtonText || "Plan Your Stay";

  return (
    <section className="heroSection">
      <Image
        src={heroImageUrl}
        alt="Villa Azure Resort"
        fill
        priority
        className="heroBackgroundImage"
      />
      {/* Gradient overlay sits above the photo for text contrast */}
      <div className="heroOverlay" />

      <div className="heroContainer">
        <span className="heroEyebrow">A Private Escape</span>
        <h1 className="heroTitle">Villa Azure Resort</h1>
        <p className="heroSubtitle">{heroTagline}</p>
        <div className="heroActions">
          <a className="heroCtaPrimary" href="#contact">
            {ctaButtonText}
          </a>
          <a className="heroCtaSecondary" href="#rooms">
            Explore Rooms &amp; Villas
          </a>
        </div>
      </div>
    </section>
  );
}
