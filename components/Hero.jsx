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
 * Dynamic design tier: the background photo drifts at a slower speed
 * than the page scroll (parallax), and the eyebrow/title/subtitle/CTA
 * row stagger in on load instead of appearing instantly. This is why
 * the component is now a Client Component — useScroll/useTransform are
 * hooks and can only run in one.
 *
 * DATA FLOW:
 * 1. Rendered as the first child inside app/visitor/page.jsx
 * 2. No data fetching — fully static content
 * 3. useScroll tracks scroll progress against heroSectionRef; the
 *    resulting value drives the background wrapper's translateY
 * 4. CTA anchors to "#contact", the CTASection further down the page
 */
"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform } from "motion/react";
import { RevealGroup, RevealItem } from "@/components/shared/motion/RevealGroup";
import "./Hero.css";

export default function Hero() {
  const heroSectionRef = useRef(null);

  // Tracks how far the visitor has scrolled through the hero section itself
  // (0 = hero just entered view, 1 = hero has fully scrolled past).
  const { scrollYProgress } = useScroll({
    target: heroSectionRef,
    offset: ["start start", "end start"],
  });

  // Background drifts down by 15% of the section height as the visitor
  // scrolls past — a subtle parallax, not a dramatic one, so text stays
  // easy to read the whole time.
  const backgroundY = useTransform(scrollYProgress, [0, 1], ["0%", "15%"]);

  return (
    <section className="heroSection" ref={heroSectionRef}>
      {/* Parallax wrapper — overscanned via CSS so the drifting image
          never reveals empty space at the section edges */}
      <motion.div className="heroBackgroundWrapper" style={{ y: backgroundY }}>
        {/* Placeholder photo (Unsplash) — swap for real resort photography later */}
        <Image
          src="https://images.unsplash.com/photo-1759372945658-1e9f56e751bd?auto=format&fit=crop&w=2400&q=80"
          alt="Tropical villa with a private pool at twilight"
          fill
          priority
          className="heroBackgroundImage"
        />
      </motion.div>
      {/* Gradient overlay sits above the photo for text contrast */}
      <div className="heroOverlay" />

      <RevealGroup as="div" className="heroContainer" stagger={0.12} amount={0}>
        <RevealItem as="span" className="heroEyebrow">A Private Escape</RevealItem>
        <RevealItem as="h1" className="heroTitle">Villa Azure Resort</RevealItem>
        <RevealItem as="p" className="heroSubtitle">
          Intimate villas, quiet shores, and a stillness that only comes with distance from everything else.
        </RevealItem>
        <RevealItem as="div" className="heroActions">
          <a className="heroCtaPrimary" href="#contact">
            Plan Your Stay
          </a>
          <a className="heroCtaSecondary" href="#rooms">
            Explore Rooms &amp; Villas
          </a>
        </RevealItem>
      </RevealGroup>
    </section>
  );
}
