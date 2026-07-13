/**
 * FILE: components/shared/motion/PageTransition.jsx
 * ROLE: Visitor — shared shell wrapper, used once in app/visitor/layout.jsx
 *
 * PURPOSE:
 * Gives every navigation between visitor pages (home → booking → policies)
 * a smooth cross-fade instead of an instant swap. This is the "smooth page
 * transitions" half of the Dynamic design tier — Header and Footer stay
 * fixed in app/visitor/layout.jsx (outside this wrapper) so only the
 * {children} slot animates; the nav bar never flickers between routes.
 *
 * DATA FLOW:
 * 1. app/visitor/layout.jsx renders <PageTransition>{children}</PageTransition>
 * 2. usePathname() gives the current route — used as the AnimatePresence key
 * 3. When the visitor navigates, the outgoing page's motion.div plays its
 *    "exit" animation while the incoming page mounts and plays "animate"
 */
"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";

export default function PageTransition({ children }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
