/**
 * FILE: components/shared/MaintenanceLoginLink.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * While maintenanceMode is on, app/visitor/layout.jsx wraps the entire
 * Header (and everything else a guest could interact with) in `inert`
 * — so Header's own ".headerLoginLink" is unclickable by design.
 * `inert` cannot be selectively lifted for one descendant, so this
 * component measures that dead link's real on-screen position and
 * renders a second, REAL Login link as a sibling OUTSIDE the inert
 * tree, positioned exactly on top of it. This keeps Login in its
 * normal spot — left of Book Now on desktop, next to the hamburger on
 * mobile/tablet — instead of guessing a fixed offset that breaks the
 * moment the layout is narrower or Book Now's width changes.
 *
 * DATA FLOW:
 * 1. app/visitor/layout.jsx renders this as a sibling of the inert
 *    wrapper only when SystemSettings.maintenanceMode is true
 * 2. On mount, and on every resize, it reads
 *    document.querySelector(".headerLoginLink")'s getBoundingClientRect()
 *    and copies those exact coordinates onto this overlay via inline
 *    style — same technique as Header.jsx/MaintenanceBanner.jsx
 *    already use for --header-height/--maintenance-banner-height,
 *    just applied to position instead of a CSS variable
 * 3. Header itself is `position: fixed`, so its Login link's rect
 *    does not shift on page scroll — only resize (and the banner's
 *    height, which can change the header's top offset) needs a
 *    re-measure
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./MaintenanceLoginLink.css";

export default function MaintenanceLoginLink() {
  const [position, setPosition] = useState(null);

  useEffect(() => {
    // Copies the real (but inert) Login link's exact on-screen box so
    // this overlay lands in its normal spot instead of a guessed one.
    function measure() {
      const target = document.querySelector(".headerLoginLink");
      if (!target) return;

      const box = target.getBoundingClientRect();
      setPosition({ top: box.top, left: box.left, width: box.width, height: box.height });
    }

    measure();

    // Re-measure on viewport resize (desktop <-> mobile breakpoint
    // swaps Book Now in/out, which shifts Login's left position).
    window.addEventListener("resize", measure);

    // Re-measure if the header's own height changes (e.g. the
    // maintenance banner text wraps to 2 lines on a narrow screen,
    // pushing the whole fixed header down).
    const headerElement = document.querySelector(".siteHeader");
    let resizeObserver;
    if (headerElement && "ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(headerElement);
    }

    return () => {
      window.removeEventListener("resize", measure);
      resizeObserver?.disconnect();
    };
  }, []);

  // Nothing to overlay yet on the very first paint before measurement
  // runs — avoids a flash at the wrong (0,0) position.
  if (!position) return null;

  return (
    <Link
      href="/superAdmin/login"
      className="maintenanceLoginLink"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
      }}
    >
      Login
    </Link>
  );
}
