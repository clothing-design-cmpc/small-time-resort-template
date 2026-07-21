/**
 * FILE: components/sections/CTASection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Final homepage call-to-action block before the footer. Centered copy
 * above a sliding date carousel — guests pick a check-in date directly
 * here instead of choosing between two generic buttons.
 * High-contrast surface so it reads as a visual anchor at the
 * bottom of the page.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx after TestimonialsSection
 * 2. Server Component reads the singleton SystemSettings row directly
 *    via Prisma (same config-driven pattern TestimonialsSection uses)
 *    — ctaSectionHeading, ctaSectionSubtext, and ctaSectionVisible are
 *    all editable by the super-admin under Content > Homepage
 * 3. Returns null entirely when the admin has turned the section off
 * 4. Falls back to the original static copy so this section is never
 *    blank before an admin fills in custom CTA text
 * 5. <DateCarousel /> owns its own date state — no data fetching
 */
import { prisma } from "@/services/prisma";
import DateCarousel from "@/components/shared/DateCarousel";
import "./CTASection.css";

const DEFAULT_CTA_HEADING = "Reserve Your Villa";
const DEFAULT_CTA_SUBTEXT =
  "A handful of villas, a small team, and a shoreline that stays quiet. " +
  "Slide to a date below and we'll get back to you within 24 hours.";

export default async function CTASection() {
  // Read-only fetch of the singleton settings row. Fails safe to null
  // so this public page never 500s just because the row hasn't been
  // created yet — defaults below mirror the schema's own defaults.
  const settings = await prisma.systemSettings.findUnique({ where: { id: "singleton" } }).catch(() => null);

  const isVisible = settings?.ctaSectionVisible ?? true;
  if (!isVisible) return null;

  const heading = settings?.ctaSectionHeading?.trim() || DEFAULT_CTA_HEADING;
  const subtext = settings?.ctaSectionSubtext?.trim() || DEFAULT_CTA_SUBTEXT;

  return (
    <section className="ctaSection" id="contact">
      <div className="ctaContainer">
        <span className="ctaEyebrow">Ready to Book?</span>
        <h2 className="ctaTitle">{heading}</h2>
        <p className="ctaBody">{subtext}</p>
        <DateCarousel />
      </div>
    </section>
  );
}
