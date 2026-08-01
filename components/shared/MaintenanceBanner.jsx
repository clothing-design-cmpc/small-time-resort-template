/**
 * FILE: components/shared/MaintenanceBanner.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Two visual pieces shown on every /visitor page while the Dashboard's
 * "Maintenance Mode" toggle (MaintenanceToggleClient.jsx) is ON:
 *   1. A fixed strip at the very top of the viewport with the notice text.
 *   2. A full-viewport, tiled "UNDER MAINTENANCE" watermark that stays
 *      visible behind whichever section the guest has scrolled to — this
 *      is what makes the maintenance state read as a watermark "sa bawat
 *      sections" instead of only a strip up top that scrolls out of view.
 * Together with app/visitor/layout.jsx wrapping the rest of the page in
 * an `inert` container, this makes maintenance mode a real, site-wide
 * lockdown: every button/link/calendar cell underneath is visible but
 * completely non-interactive, not just visually flagged.
 *
 * Client Component (not a plain Server Component anymore) because it
 * measures its own rendered height and publishes it as the
 * --maintenance-banner-height CSS variable, the same pattern
 * Header.jsx already uses for --header-height. Header.css reads that
 * variable to push the sticky nav bar down below this strip instead of
 * both fighting for the same top:0 spot (the overlapping-text bug from
 * the old sticky-banner-under-fixed-header layout).
 *
 * DATA FLOW:
 * 1. app/visitor/layout.jsx renders this above the Header whenever
 *    SystemSettings.maintenanceMode is true
 * 2. On mount/resize, ResizeObserver measures the strip and writes
 *    --maintenance-banner-height onto <html> so Header.css/Visitor.css
 *    can offset around it
 * 3. On unmount (maintenance turned back off without a full page
 *    reload), the variable resets to 0px so nothing is left over
 */
"use client";

import { useEffect, useRef } from "react";
import "./MaintenanceBanner.css";

export default function MaintenanceBanner({ message }) {
  const bannerRef = useRef(null);

  // Keeps --maintenance-banner-height in sync with the strip's actual
  // rendered height (the message text can wrap to 1 or 2 lines
  // depending on length and viewport width), mirroring how Header.jsx
  // tracks --header-height. Resets to 0px on unmount so a stale offset
  // never lingers after an admin turns maintenance mode back off.
  useEffect(() => {
    const bannerElement = bannerRef.current;
    if (!bannerElement) return;

    function updateBannerHeightVariable() {
      document.documentElement.style.setProperty(
        "--maintenance-banner-height",
        `${bannerElement.offsetHeight}px`
      );
    }

    updateBannerHeightVariable();

    const resizeObserver = new ResizeObserver(updateBannerHeightVariable);
    resizeObserver.observe(bannerElement);
    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.setProperty("--maintenance-banner-height", "0px");
    };
  }, []);

  return (
    <>
      {/* Fixed notice strip — always pinned to the very top, above the header */}
      <div ref={bannerRef} className="maintenanceBanner" role="alert">
        <span className="maintenanceBannerIcon" aria-hidden="true">⚠</span>
        <div className="maintenanceBannerText">
          <strong>your-private-resort is currently under maintenance.</strong>
          <span>{message}</span>
        </div>
      </div>

      {/* Tiled watermark — fixed full-viewport, repeats behind every
          section as the guest scrolls, decorative only (pointer-events
          none; the real "nothing is clickable" guarantee comes from the
          `inert` wrapper in app/visitor/layout.jsx, not from this layer) */}
      <div className="maintenanceWatermarkOverlay" aria-hidden="true" />
    </>
  );
}
