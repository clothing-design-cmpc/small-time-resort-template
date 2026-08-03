/**
 * FILE: components/shared/PromoAlertBanner.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Sits at the very top of every /visitor page's content (rendered from
 * app/visitor/layout.jsx, above {children}) and tells guests right away
 * when the super-admin has a Promo Date set up — e.g. "🎉 5% OFF
 * Overnight stays — Aug 20-22". Scrolls with the page (not a fixed
 * strip like MaintenanceBanner) so it never needs the
 * --header-height-style offset dance; it's just the first thing inside
 * the normal content flow.
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
 *    of text
 * 4. Dismissible per page-view only (plain component state, not
 *    persisted) — reappears on the next page load/reload so a
 *    still-active promo keeps getting surfaced to new visits
 */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import "./PromoAlertBanner.css";

const SHORT_DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const APPLIES_TO_LABEL = {
  all: "all bookings",
  overnight: "Overnight stays",
  day_tour: "Day Tour",
  night_tour: "Night Tour",
};

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
 * formatClusterRange
 * "Aug 20" for a single day, "Aug 20-22" for a multi-day cluster.
 */
function formatClusterRange(cluster) {
  const start = SHORT_DATE_FMT.format(cluster.startDate);
  if (cluster.startDate.getTime() === cluster.endDate.getTime()) return start;
  const end = SHORT_DATE_FMT.format(cluster.endDate);
  return `${start}–${end}`;
}

export default function PromoAlertBanner() {
  const [clusters, setClusters] = useState([]);
  const [isDismissed, setIsDismissed] = useState(false);

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

  if (isDismissed || clusters.length === 0) return null;

  const [headlineCluster, ...restClusters] = clusters;
  const appliesToLabel = APPLIES_TO_LABEL[headlineCluster.appliesTo] ?? "bookings";

  return (
    <div className="promoAlertBanner" role="status">
      <span className="promoAlertBannerIcon" aria-hidden="true">🎉</span>
      <p className="promoAlertBannerText">
        <strong>{headlineCluster.discountPercent}% OFF</strong> {appliesToLabel} — {formatClusterRange(headlineCluster)}
        {restClusters.length > 0 && (
          <span className="promoAlertBannerMore"> (+{restClusters.length} more promo date{restClusters.length > 1 ? "s" : ""})</span>
        )}
      </p>
      <button
        type="button"
        className="promoAlertBannerDismiss"
        onClick={() => setIsDismissed(true)}
        aria-label="Dismiss promo alert"
      >
        ✕
      </button>
    </div>
  );
}
