/**
 * FILE: components/shared/ScrollToTopOnLoad.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Forces the page to open on the Hero section every time the visitor
 * homepage loads or is refreshed. Without this, the browser's default
 * scroll restoration re-opens the page at whatever scroll position the
 * visitor was previously at (e.g. mid-page after F5), instead of Hero.
 *
 * DATA FLOW:
 * 1. Rendered once inside app/visitor/layout.jsx, above {children}
 * 2. On mount (every full page load/reload), disables the browser's
 *    automatic scroll restoration and jumps the viewport to (0, 0)
 * 3. Renders nothing — purely a side-effect component
 */
"use client";

import { useEffect } from "react";

export default function ScrollToTopOnLoad() {
  // Runs once per page load. Reload/refresh remounts the whole app, so
  // this effect fires again every time — always landing back on Hero.
  useEffect(() => {
    // Tell the browser not to remember/restore the previous scroll
    // position for this session — we control it ourselves below.
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    // Jump instantly to the top (Hero section) — no smooth animation,
    // since this should look like the page simply opened there.
    window.scrollTo(0, 0);
  }, []);

  return null;
}
