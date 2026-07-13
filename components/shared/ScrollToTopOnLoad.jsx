/**
 * FILE: components/shared/ScrollToTopOnLoad.jsx
 * ROLE: Visitor — shared across every page under app/visitor/
 *
 * PURPOSE:
 * Forces every page load and navigation within the visitor section to
 * start scrolled to the top, instead of the browser restoring a
 * previous scroll position (which happens on refresh in some browsers).
 *
 * DATA FLOW:
 * 1. Mounted once inside app/visitor/layout.jsx, above <Header>
 * 2. Re-runs whenever the pathname changes (visitor navigates to a
 *    different page), scrolling back to the top each time
 */
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function ScrollToTopOnLoad() {
  const pathname = usePathname();

  useEffect(() => {
    // Runs on first mount and every time the visitor navigates to a
    // new path — ensures each page always opens at the top.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
