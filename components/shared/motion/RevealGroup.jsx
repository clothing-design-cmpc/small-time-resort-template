/**
 * FILE: components/shared/motion/RevealGroup.jsx
 * ROLE: Visitor — shared motion primitive, used across all visitor pages
 *
 * PURPOSE:
 * Animates a grid/list of cards so each one fades in slightly after the
 * previous one (a "stagger"), instead of the whole grid popping in at
 * once. Used for room cards, amenity cards, product cards, and
 * testimonial cards on the Dynamic-tier homepage.
 *
 * Motion's variant system propagates automatically: the parent
 * (RevealGroup) declares "hidden"/"visible" states with a
 * staggerChildren transition, and every RevealItem child inherits
 * "visible" from its parent at a slightly later delay — no manual
 * index math required in the calling component.
 *
 * DATA FLOW:
 * 1. Parent renders <RevealGroup> wrapping a list of <RevealItem> children
 * 2. RevealGroup enters the viewport (whileInView) and triggers "visible"
 * 3. Each RevealItem animates in turn, offset by `stagger` seconds
 */
"use client";

import { motion } from "motion/react";

/* Container — owns the whileInView trigger and the stagger timing */
export function RevealGroup({
  children,
  as = "div",
  className,
  stagger = 0.08,
  once = true,
  amount = 0.15,
  ...rest
}) {
  const Component = motion[as] || motion.div;

  const containerVariants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: stagger },
    },
  };

  return (
    <Component
      className={className}
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      {...rest}
    >
      {children}
    </Component>
  );
}

/* Item — has no trigger of its own; inherits "visible" from RevealGroup */
export function RevealItem({ children, as = "div", className, y = 20, hoverLift = false, ...rest }) {
  const Component = motion[as] || motion.div;

  const itemVariants = {
    hidden: { opacity: 0, y },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
  };

  // Optional hover lift — used on clickable cards (rooms, products) to signal
  // interactivity. Left off by default for cards that aren't links/buttons.
  const hoverProps = hoverLift
    ? { whileHover: { y: -6 }, transition: { type: "spring", stiffness: 300, damping: 22 } }
    : {};

  return (
    <Component className={className} variants={itemVariants} {...hoverProps} {...rest}>
      {children}
    </Component>
  );
}
