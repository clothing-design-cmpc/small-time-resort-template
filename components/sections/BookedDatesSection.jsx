/**
 * FILE: components/sections/BookedDatesSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Shows guests which dates are already reserved. Two parts:
 *   1. A horizontally sliding carousel of booked date cards.
 *      Arrow buttons and direct card clicks drive selection — no passive
 *      scroll listener that could call setState and re-trigger renders.
 *   2. A mini calendar that highlights booked dates (red) and today (green).
 *      Prev/next month buttons let the visitor browse any month.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx between Testimonials and CTA
 * 2. On mount, fetches GET /api/bookings/dates — the server expands every
 *    confirmed Booking's [checkInDate, checkOutDate) range into a flat,
 *    deduplicated list of "YYYY-MM-DD" strings. Replaces the old
 *    hardcoded BOOKED_DATES constant that lived directly in this file.
 * 3. State: bookedDates (fetched), isLoading, loadError, activeIndex
 *    (which carousel card), calMonthOffset (calendar paging)
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./BookedDatesSection.css";

/* ─── Formatters ─────────────────────────────────────────────────────────── */
const WEEKDAY_SHORT  = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const MONTH_SHORT    = new Intl.DateTimeFormat("en-US", { month: "short" });
const FULL_DATE_FMT  = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const MONTH_YEAR_FMT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function toKey(date) {
  /* Local-date YYYY-MM-DD — avoids UTC-offset drift from toISOString() */
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const TODAY_KEY = toKey(TODAY);

/* ─── Main exported section ──────────────────────────────────────────────── */
export default function BookedDatesSection() {
  /*
   * bookedDates  — "YYYY-MM-DD" strings fetched from /api/bookings/dates
   * isLoading    — true while the fetch is in flight
   * loadError    — set if the fetch fails, drives the error state + retry
   * activeIndex  — which booked-date card is centered/selected in the carousel
   * calMonthOffset — how many months the visitor has paged from the selected date's month
   */
  const [bookedDates, setBookedDates]       = useState([]);
  const [maintenanceDates, setMaintenanceDates] = useState([]);
  const [isLoading, setIsLoading]           = useState(true);
  const [loadError, setLoadError]           = useState(null);
  const [activeIndex, setActiveIndex]       = useState(0);
  const [calMonthOffset, setCalMonthOffset] = useState(0);
  // Bumped by the error state's "Try again" button to re-run the fetch
  // effect below without duplicating the fetch logic outside the effect.
  const [reloadToken, setReloadToken]       = useState(0);

  const trackRef    = useRef(null);
  const isScrolling  = useRef(false);   /* true while a programmatic scroll is animating */
  const scrollTimer  = useRef(null);

  /*
   * Fetch booked dates on mount (and whenever reloadToken changes, i.e.
   * the visitor clicks "Try again" after a failed load). The async
   * function is defined inside the effect so setState calls are always
   * inside its own resolved callback, not the synchronous effect body.
   */
  useEffect(() => {
    let isCancelled = false;

    async function fetchBookedDates() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch("/api/bookings/dates");
        const result = await response.json();
        if (isCancelled) return;

        if (!result.success) {
          setLoadError(result.message || "Failed to load booked dates. Please try again.");
          return;
        }

        setBookedDates(result.data.bookedDates);
        setMaintenanceDates(result.data.maintenanceDates ?? []);
        setActiveIndex(0);
      } catch {
        if (!isCancelled) {
          setLoadError("We couldn't reach the server. Check your connection and try again.");
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    fetchBookedDates();
    return () => {
      isCancelled = true;
    };
  }, [reloadToken]);

  /* Parsed Date objects + a lookup Set, recomputed only when bookedDates changes */
  const bookedDateObjects = useMemo(
    () =>
      bookedDates.map((s) => {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      }),
    [bookedDates]
  );
  const bookedSet = useMemo(() => new Set(bookedDates), [bookedDates]);
  const maintenanceSet = useMemo(() => new Set(maintenanceDates), [maintenanceDates]);

  const selectedDate = bookedDateObjects[activeIndex];
  const selectedKey  = selectedDate ? toKey(selectedDate) : null;

  /*
   * centerCardInTrack
   * Scrolls only the carousel track's own horizontal scrollbar so the
   * given card sits centered — never calls scrollIntoView, which also
   * scrolls the page's vertical axis to bring an off-screen section into
   * view. That was the root cause of the page jumping down to this
   * section on every reload instead of staying on the Hero section.
   */
  function centerCardInTrack(track, card, behavior) {
    if (!track || !card) return;
    const targetLeft = card.offsetLeft - track.clientWidth / 2 + card.clientWidth / 2;

    // .bookedCarouselTrack sets `scroll-behavior: smooth` in CSS (for the
    // arrow/click-driven scrolls). Passing behavior: "instant" to scrollTo()
    // does not reliably override that CSS on every browser — the jump can
    // get smooth-animated and cut short by the very next effect run, which
    // was leaving the very first render scrolled to the wrong card instead
    // of the active one. Forcing the CSS property itself to "auto" for the
    // instant case guarantees a true, immediate jump; the smooth case is
    // untouched so arrow/card clicks keep animating as before.
    if (behavior === "instant") {
      const previousScrollBehavior = track.style.scrollBehavior;
      track.style.scrollBehavior = "auto";
      track.scrollTo({ left: targetLeft, behavior: "auto" });
      track.style.scrollBehavior = previousScrollBehavior;
      return;
    }

    track.scrollTo({ left: targetLeft, behavior });
  }

  /*
   * selectIndex
   * Single function that updates activeIndex, resets the calendar to the
   * selected date's month, and smooth-scrolls the carousel to center the card.
   * Never touches state inside a scroll handler — selection only happens
   * through clicks (card click, arrow click).
   */
  function selectIndex(index) {
    const clamped = Math.max(0, Math.min(bookedDateObjects.length - 1, index));
    setActiveIndex(clamped);
    setCalMonthOffset(0);   /* jump calendar back to the selected month */

    const track = trackRef.current;
    if (!track) return;
    const card = track.children[clamped];
    if (!card) return;

    isScrolling.current = true;
    centerCardInTrack(track, card, "smooth");

    window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      isScrolling.current = false;
    }, 600);
  }

  /* Scroll the first card into the visual center whenever the fetched list
     changes — DOM-only side effect. Uses the track-only scrollTo helper so
     this never scrolls the page vertically. */
  useEffect(() => {
    const track = trackRef.current;
    if (!track || bookedDateObjects.length === 0) return;
    const card = track.children[0];
    if (!card) return;

    // Wait one frame so the browser has finished laying out all 45+ cards
    // before we read offsetLeft — measuring too early (same tick as the
    // state update that grew the list) can return stale/zeroed values.
    const rafId = window.requestAnimationFrame(() => {
      centerCardInTrack(track, card, "instant");
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [bookedDateObjects.length]);

  /* ─── Calendar derived state ─────────────────────────────────── */
  const calBase    = selectedDate
    ? new Date(selectedDate.getFullYear(), selectedDate.getMonth() + calMonthOffset, 1)
    : new Date(TODAY.getFullYear(), TODAY.getMonth() + calMonthOffset, 1);
  const calYear    = calBase.getFullYear();
  const calMonth   = calBase.getMonth();
  const firstDay   = new Date(calYear, calMonth, 1);
  const totalDays  = new Date(calYear, calMonth + 1, 0).getDate();
  const leadBlanks = firstDay.getDay();
  const calLabel   = MONTH_YEAR_FMT.format(calBase);

  /* ─── Render ─────────────────────────────────────────────────── */
  return (
    <section className="bookedDatesSection">
      <div className="bookedDatesContainer">

        {/* Header */}
        <div className="bookedDatesHeader">
          <span className="bookedDatesEyebrow">Availability</span>
          <h2 className="bookedDatesTitle">Booked Dates</h2>
          <p className="bookedDatesSubtitle">
            These dates are already reserved. Plan around them or contact us —
            cancellations open spots regularly.
          </p>
        </div>

        {/* Loading skeleton — mirrors the shape of the carousel + calendar */}
        {isLoading && (
          <div className="bookedDatesSkeletonWrap" aria-label="Loading booked dates">
            <div className="bookedDatesSkeletonReadout skeletonBlock" />
            <div className="bookedDatesSkeletonCarousel">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="bookedDatesSkeletonCard skeletonBlock" />
              ))}
            </div>
            <div className="bookedDatesSkeletonCalendar skeletonBlock" />
          </div>
        )}

        {/* Error state — user-friendly message + retry, never raw error text */}
        {!isLoading && loadError && (
          <div className="bookedDatesErrorState">
            <p className="bookedDatesErrorMessage">{loadError}</p>
            <button
              type="button"
              className="bookedDatesRetryButton"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state — no active bookings in the database yet. The
            carousel/readout have nothing to show, but the calendar below
            still renders (every day just shows as available, no red). */}
        {!isLoading && !loadError && bookedDateObjects.length === 0 && (
          <div className="bookedDatesEmptyState">
            <p className="bookedDatesEmptyTitle">No dates are booked yet.</p>
            <p className="bookedDatesEmptySubtitle">The room is currently available — check the calendar below or the Reserve Your Room section to pick a date.</p>
          </div>
        )}

        {/* Carousel + "Viewing" readout — only meaningful once there's at
            least one booked date to slide through. */}
        {!isLoading && !loadError && bookedDateObjects.length > 0 && (
          <>
            {/* Selected date readout */}
            <p className="bookedDatesReadout">
              Viewing:{" "}
              <span className="bookedDatesReadoutValue">
                {FULL_DATE_FMT.format(selectedDate)}
              </span>
            </p>

            {/* Carousel */}
            <div className="bookedCarouselViewport">
              <button
                type="button"
                className="bookedCarouselArrow"
                aria-label="Previous booked date"
                onClick={() => selectIndex(activeIndex - 1)}
                disabled={activeIndex === 0}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <div
                className="bookedCarouselTrack"
                ref={trackRef}
                role="listbox"
                aria-label="Booked dates"
              >
                {bookedDateObjects.map((date, index) => (
                  <button
                    key={toKey(date)}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`bookedCard${index === activeIndex ? " bookedCardActive" : ""}`}
                    onClick={() => selectIndex(index)}
                  >
                    <span className="bookedCardWeekday">{WEEKDAY_SHORT.format(date)}</span>
                    <span className="bookedCardDay">{date.getDate()}</span>
                    <span className="bookedCardMonth">{MONTH_SHORT.format(date)}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="bookedCarouselArrow"
                aria-label="Next booked date"
                onClick={() => selectIndex(activeIndex + 1)}
                disabled={activeIndex === bookedDateObjects.length - 1}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </>
        )}

        {/* Mini calendar — always shown once loaded, regardless of whether
            any dates are booked. With zero bookings every day just renders
            as plain/available (no red), which is exactly what "no dates
            booked yet" should look like on a calendar. */}
        {!isLoading && !loadError && (
          <div className="miniCalendar" aria-label={`Calendar for ${calLabel}`}>
              <div className="miniCalendarHeader">
                <button
                  type="button"
                  className="miniCalendarNav"
                  aria-label="Previous month"
                  onClick={() => setCalMonthOffset((o) => o - 1)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span className="miniCalendarLabel">{calLabel}</span>
                <button
                  type="button"
                  className="miniCalendarNav"
                  aria-label="Next month"
                  onClick={() => setCalMonthOffset((o) => o + 1)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              <div className="miniCalendarGrid">
                {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (
                  <span key={d} className="miniCalendarWeekdayLabel">{d}</span>
                ))}

                {Array.from({ length: leadBlanks }, (_, i) => (
                  <span key={`b${i}`} className="miniCalendarBlank" />
                ))}

                {Array.from({ length: totalDays }, (_, i) => {
                  const day      = i + 1;
                  const cellDate = new Date(calYear, calMonth, day);
                  const cellKey  = toKey(cellDate);
                  const isBooked = bookedSet.has(cellKey);
                  const isToday  = cellKey === TODAY_KEY;
                  const isHigh   = cellKey === selectedKey;
                  const isMaintenance = maintenanceSet.has(cellKey);

                  let cls = "miniCalendarDay";
                  if (isBooked) cls += " miniCalendarDayBooked";
                  if (isToday)  cls += " miniCalendarDayToday";
                  if (isHigh)   cls += " miniCalendarDayHighlighted";
                  if (isMaintenance) cls += " miniCalendarDayMaintenance";

                  return (
                    <span
                      key={cellKey}
                      className={cls}
                      title={isMaintenance ? "Resort is undergoing maintenance." : undefined}
                    >
                      {isMaintenance ? (
                        <span className="miniCalendarDayMaintenanceContent">
                          <span className="miniCalendarDayMaintenanceNumber">{day}</span>
                          <span className="miniCalendarDayMaintenanceIcon" aria-hidden="true">!</span>
                        </span>
                      ) : (
                        day
                      )}
                    </span>
                  );
                })}
              </div>

              <div className="miniCalendarLegend">
                <span className="miniCalendarLegendItem">
                  <span className="miniCalendarLegendDot miniCalendarLegendDotBooked" />
                  Booked
                </span>
                <span className="miniCalendarLegendItem">
                  <span className="miniCalendarLegendDot miniCalendarLegendDotMaintenance" />
                  Under Maintenance
                </span>
                <span className="miniCalendarLegendItem">
                  <span className="miniCalendarLegendDot miniCalendarLegendDotToday" />
                  Today
                </span>
                <span className="miniCalendarLegendItem">
                  <span className="miniCalendarLegendDot miniCalendarLegendDotAvailable" />
                  Available
                </span>
              </div>
          </div>
        )}

      </div>
    </section>
  );
}