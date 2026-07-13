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
 * 2. <DateCarousel /> owns its own date state — no data fetching
 * 3. Dynamic design tier: the whole CTA block fades/slides in on scroll
 */
import DateCarousel from "@/components/shared/DateCarousel";
import ScrollReveal from "@/components/shared/motion/ScrollReveal";
import "./CTASection.css";

export default function CTASection() {
  return (
    <section className="ctaSection" id="contact">
      <ScrollReveal as="div" className="ctaContainer">
        <span className="ctaEyebrow">Ready to Book?</span>
        <h2 className="ctaTitle">Reserve Your Villa</h2>
        <p className="ctaBody">
          A handful of villas, a small team, and a shoreline that stays quiet.
          Slide to a date below and we&apos;ll get back to you within 24 hours.
        </p>
        <DateCarousel />
      </ScrollReveal>
    </section>
  );
}
