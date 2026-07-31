/**
 * FILE: components/shared/RightClickGuard.jsx
 * PURPOSE:
 * Disables the browser's right-click context menu across the entire
 * app — visitor site AND super-admin — mounted once in the root
 * layout so it applies globally, not per-page or per-section (Rule
 * 18.7). This is active from the start of every environment
 * (localhost dev included), unlike the dev-tools blocker in Rule 19.5
 * which is production-only — right-click disable has no dev-only
 * reason to be skipped locally.
 *
 * This is a UX-level deterrent only (prevents casual "Save image as…" /
 * "Inspect" via the context menu) — it is NOT a security boundary.
 * Keyboard shortcuts (F12, Ctrl+Shift+I) and browser dev tools opened
 * another way are unaffected here; that is Rule 19.5's job, applied
 * separately at handoff.
 *
 * DATA FLOW: none. Pure client-side event listener, no server calls,
 * nothing to fetch or store.
 */
"use client";

import { useEffect } from "react";

export default function RightClickGuard() {
  // Attaches once for the lifetime of the app shell (root layout never
  // unmounts on route change) — blocks the contextmenu event before
  // the browser shows its native menu.
  useEffect(() => {
    function blockContextMenu(event) {
      event.preventDefault();
    }

    document.addEventListener("contextmenu", blockContextMenu);
    return () => document.removeEventListener("contextmenu", blockContextMenu);
  }, []);

  return null;
}
