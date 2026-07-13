/**
 * FILE: components/shared/motion/ScrollReveal.jsx
 * ROLE: Visitor — shared motion primitive, used across all visitor pages
 *
 * PURPOSE:
 * Wraps any element (section, div, article, etc.) so it fades and slides
 * into place instead of appearing instantly. This is the core building
 * block of the "Dynamic" design tier — Static tier renders content with
 * no motion at all, Dynamic tier reveals it as the visitor scrolls.
 *
 * This file is a Client Component ("use client"), but the pages/sections
 * that import it (page.jsx, About.jsx, CTASection.jsx, etc.) stay Server
 * Components — Next.js only needs the client boundary at the component
 * that actually uses motion/scroll behavior, not at the parent.
 *
 * DATA FLOW:
 * 1. Parent renders <ScrollReveal as="section" ...>content</ScrollReveal>
 * 2. trigger="view" (default): animates once when ~20% of the element
 *    enters the viewport (whileInView) — used for content further down
 *    the page.
 * 3. trigger="mount": animates immediately when the component mounts —
 *    used for above-the-fold content (Hero) or state-driven UI (booking
 *    confirmation panel) where there's nothing to "scroll into view".
 */
"use client";

import { motion } from "motion/react";

export default function ScrollReveal({
  children,
  as = "div",
  className,
  delay = 0,
  y = 24,
  duration = 0.6,
  once = true,
  amount = 0.2,
  trigger = "view",
  ...rest
}) {
  // Resolve the motion-enabled tag (motion.section, motion.div, motion.article, ...)
  const Component = motion[as] || motion.div;

  const variants = {
    hidden: { opacity: 0, y },
    visible: { opacity: 1, y: 0 },
  };

  // "view" watches scroll position; "mount" plays immediately on render.
  // Kept as two branches rather than one prop combo so callers never have
  // to reason about viewport thresholds for above-the-fold content.
  const triggerProps =
    trigger === "view"
      ? { initial: "hidden", whileInView: "visible", viewport: { once, amount } }
      : { initial: "hidden", animate: "visible" };

  return (
    <Component
      className={className}
      variants={variants}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
      {...triggerProps}
      {...rest}
    >
      {children}
    </Component>
  );
}
