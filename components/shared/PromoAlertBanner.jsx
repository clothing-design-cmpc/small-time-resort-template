/**
 * FILE: components/shared/PromoAlertBanner.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Sits at the very top of every /visitor page's content (rendered from
 * app/visitor/layout.jsx, above {children}) and tells guests right away
 * when the super-admin has a Promo Date set up — e.g. "🎉 5% OFF All
 * Types Starting from Aug 3 to Aug 8". Sticky (position: sticky, pinned
 * right under the fixed Header) so it stays visible while the visitor
 * scrolls the page, and the message runs as a continuous right-to-left
 * ticker so a longer line never has to wrap or get cut off in the
 * strip's fixed height.
 *
 * The ticker distance is measured in real pixels via getBoundingClientRect
 * (not viewport units or bare CSS percentages) — the track starts just
 * past the right edge of the banner's own marquee slot and finishes
 * just past its own left edge, so it can never render off in the middle
 * of nowhere with a huge empty gap the way a %/vw-based version can
 * when the container and the viewport aren't the same width.
 *
 * Renders nothing at all if there are no active/upcoming promo dates —
 * this is purely additive, never a placeholder "no promos" message.
 *
 * DATA FLOW:
 * 1. On mount, fetches GET /api/promo-dates (public, pre-filtered to
 *    isActive + not-yet-past)
 * 2. groupIntoClusters() collapses consecutive dates that share the
 *    same discountPercent + appliesTo into one readable range (e.g.
 *    Aug 20, 21, 22 at 5% Overnight -> one "Aug 20-22" cluster) instead
 *    of listing every date separately
 * 3. Headlines the SOONEST cluster; if more clusters exist, shows a
 *    "+N more promo date(s)" tail so the banner never turns into a wall
 *    of text.
 * 4. Not dismissible — as long as an active promo cluster exists, this
 *    banner stays on screen. The message enters from the right edge of
 *    the banner's own marquee slot and scrolls to a full left exit,
 *    then loops (right-to-left "ticker" motion, not a seamless
 *    wrap-around).
 * 5. Every finished promo date is auto-deleted from the database by
 *    app/api/cron/promo-cleanup/route.js (daily), so this banner and
 *    the visitor calendar's promo dots never have to filter out stale
 *    rows themselves beyond the date >= today check already in
 *    app/api/promo-dates/route.js
 * 6. Renders nothing while Header's mobile hamburger dropdown is open
 *    (shared isMobileMenuOpen from HeaderMenuContext, a sibling
 *    provider both components sit inside in app/visitor/layout.jsx)
 * 7. Measures its own rendered height on mount/resize and publishes it
 *    as --promo-banner-height (same ResizeObserver pattern Header.jsx
 *    uses for --header-height and MaintenanceBanner.jsx uses for
 *    --maintenance-banner-height), resetting to 0px on unmount/hide.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useHeaderMenu } from "./HeaderMenuContext";
import "./PromoAlertBanner.css";

const SHORT_DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

// "Tour type" wording used directly inside the sentence per the
// required format: "{discount}% OFF {tour type} Starting from {start}
// to {end}".
const APPLIES_TO_LABEL = {
  all: "All Types",
  overnight: "Overnight",
  day_tour: "Day Tour",
  night_tour: "Night Tour",
};

// Pixels-per-second the ticker travels at — kept constant regardless of
// message length so a longer promo line just takes proportionally
// longer to cross, instead of a fixed-duration animation that would
// speed through short messages and race through long ones.
const MARQUEE_SPEED_PX_PER_SEC = 90;

/**
 * parseDateKey
 * Reads a promo entry's ISO date string as local Y/M/D — avoids the
 * UTC-vs-local drift a raw `new Date(isoString)` display could
 * introduce (see the pattern already used across HowToBookSection.jsx).
 */
function parseDateKey(isoString) {
  const [year, month, day] = isoString.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * groupIntoClusters
 * Collapses a sorted list of { date, discountPercent, appliesTo, label }
 * entries into runs of consecutive calendar days that share the same
 * discount% and appliesTo scope, so "Aug 20, Aug 21, Aug 22 — 5%
 * Overnight" reads as one "Aug 20-22" range instead of three separate
 * lines.
 */
function groupIntoClusters(promoDates) {
  const clusters = [];

  for (const entry of promoDates) {
    const entryDate = parseDateKey(entry.date);
    const lastCluster = clusters[clusters.length - 1];

    if (lastCluster) {
      const lastDate = lastCluster.endDate;
      const nextDay = new Date(lastDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const isConsecutive = entryDate.getTime() === nextDay.getTime();
      const sameScope = lastCluster.discountPercent === Number(entry.discountPercent) && lastCluster.appliesTo === entry.appliesTo;

      if (isConsecutive && sameScope) {
        lastCluster.endDate = entryDate;
        continue;
      }
    }

    clusters.push({
      startDate: entryDate,
      endDate: entryDate,
      discountPercent: Number(entry.discountPercent),
      appliesTo: entry.appliesTo,
      label: entry.label,
    });
  }

  return clusters;
}

/**
 * formatClusterMessage
 * Builds the exact required sentence: "{discount}% OFF {tour type}
 * Starting from {start date} to {end date}". A single-day cluster still
 * reads naturally since start and end are the same date.
 */
function formatClusterMessage(cluster) {
  const tourType = APPLIES_TO_LABEL[cluster.appliesTo] ?? "All Types";
  const start = SHORT_DATE_FMT.format(cluster.startDate);
  const end = SHORT_DATE_FMT.format(cluster.endDate);
  return `${cluster.discountPercent}% OFF ${tourType} Starting from ${start} to ${end}`;
}

export default function PromoAlertBanner() {
  const [clusters, setClusters] = useState([]);
  const { isMobileMenuOpen } = useHeaderMenu();
  const bannerRef = useRef(null);
  const marqueeSlotRef = useRef(null);
  const marqueeTrackRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;

    async function fetchPromoDates() {
      try {
        const response = await axios.get("/api/promo-dates");
        if (isCancelled) return;
        setClusters(groupIntoClusters(response.data?.data ?? []));
      } catch {
        // Fails silently — a broken promo fetch should never surface as
        // an error banner on the homepage; it just means no promo shows.
        if (!isCancelled) setClusters([]);
      }
    }

    fetchPromoDates();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Publishes --promo-banner-height so this strip's rendered height is
  // available the same way --header-height and
  // --maintenance-banner-height already are.
  useEffect(() => {
    const bannerElement = bannerRef.current;
    if (!bannerElement || clusters.length === 0 || isMobileMenuOpen) {
      document.documentElement.style.setProperty("--promo-banner-height", "0px");
      return;
    }

    function updateBannerHeightVariable() {
      document.documentElement.style.setProperty("--promo-banner-height", `${bannerElement.offsetHeight}px`);
    }

    updateBannerHeightVariable();

    const resizeObserver = new ResizeObserver(updateBannerHeightVariable);
    resizeObserver.observe(bannerElement);
    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.setProperty("--promo-banner-height", "0px");
    };
  }, [clusters.length, isMobileMenuOpen]);

  // Measures the real pixel width of the marquee slot (the clipped
  // viewport the text scrolls through) and the text itself, then writes
  // both as CSS variables the keyframe animation below reads via
  // translateX(). Using real measured pixels — not 100vw or a bare %,
  // which resolve against the wrong box — is what keeps the ticker
  // entering right at the slot's own right edge and fully exiting past
  // its own left edge, instead of appearing to jump in from somewhere
  // off in the middle of the viewport. Re-measures on resize and
  // whenever the message itself changes length.
  useEffect(() => {
    const slotElement = marqueeSlotRef.current;
    const trackElement = marqueeTrackRef.current;
    if (!slotElement || !trackElement || clusters.length === 0) return;

    function updateMarqueeDistance() {
      const slotWidth = slotElement.getBoundingClientRect().width;
      const textWidth = trackElement.getBoundingClientRect().width;
      const totalDistance = slotWidth + textWidth;

      slotElement.style.setProperty("--marquee-start", `${slotWidth}px`);
      slotElement.style.setProperty("--marquee-end", `-${textWidth}px`);
      slotElement.style.setProperty(
        "--marquee-duration",
        `${Math.max(totalDistance / MARQUEE_SPEED_PX_PER_SEC, 6)}s`
      );
    }

    updateMarqueeDistance();

    const resizeObserver = new ResizeObserver(updateMarqueeDistance);
    resizeObserver.observe(slotElement);
    resizeObserver.observe(trackElement);
    return () => resizeObserver.disconnect();
  }, [clusters]);

  // Renders nothing while the Header's mobile dropdown is open — its
  // sticky position (pinned at the COLLAPSED header height) would
  // otherwise land visually in the middle of the taller open menu
  // instead of below it (see HeaderMenuContext.jsx's file header).
  if (clusters.length === 0 || isMobileMenuOpen) return null;

  const [headlineCluster, ...restClusters] = clusters;
  const message = formatClusterMessage(headlineCluster);

  return (
    <div ref={bannerRef} className="promoAlertBanner" role="status">
      <span className="promoAlertBannerIcon" aria-hidden="true">🎉</span>
      {/* Marquee slot — a fixed-width viewport that clips the track (the
          only piece allowed to overflow horizontally). Fades both edges
          so the text doesn't visually "pop" in/out at the clip boundary. */}
      <div ref={marqueeSlotRef} className="promoAlertBannerMarquee">
        <p ref={marqueeTrackRef} className="promoAlertBannerMarqueeTrack">
          {message}
          {restClusters.length > 0 && (
            <span className="promoAlertBannerMore"> (+{restClusters.length} more promo date{restClusters.length > 1 ? "s" : ""})</span>
          )}
        </p>
      </div>
    </div>
  );
}