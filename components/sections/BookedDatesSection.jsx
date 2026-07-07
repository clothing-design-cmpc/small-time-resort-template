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
 * 2. BOOKED_DATE_OBJECTS is a module-level constant — never recreated,
 *    never causes useCallback/useEffect deps to change across renders
 * 3. State: activeIndex (which carousel card) + calMonthOffset (calendar paging)
 */
"use client";

import { useEffect, useRef, useState } from "react";
import "./BookedDatesSection.css";

/* ─── Static data — module-level so it's created once, never on re-render ── */
const BOOKED_DATES = [
  "2026-07-10","2026-07-11","2026-07-12",
  "2026-07-15","2026-07-16",
  "2026-07-20","2026-07-21","2026-07-22","2026-07-23",
  "2026-07-28","2026-07-29","2026-07-30",
  "2026-08-03","2026-08-04","2026-08-05",
  "2026-08-10","2026-08-11",
  "2026-08-18","2026-08-19","2026-08-20","2026-08-21",
  "2026-08-25","2026-08-26",
  "2026-09-01","2026-09-02","2026-09-03",
  "2026-09-08","2026-09-09",
  "2026-09-15","2026-09-16","2026-09-17",
];

const BOOKED_DATE_OBJECTS = BOOKED_DATES.map((s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
});

const BOOKED_SET = new Set(BOOKED_DATES);

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
   * activeIndex  — which booked-date card is centered/selected in the carousel
   * calMonthOffset — how many months the visitor has paged from the selected date's month
   */
  const [activeIndex, setActiveIndex]       = useState(0);
  const [calMonthOffset, setCalMonthOffset] = useState(0);

  const trackRef         = useRef(null);
  const isScrolling      = useRef(false);   /* true while a programmatic scroll is animating */
  const scrollTimer      = useRef(null);

  const selectedDate = BOOKED_DATE_OBJECTS[activeIndex];
  const selectedKey  = toKey(selectedDate);

  /*
   * selectIndex
   * Single function that updates activeIndex, resets the calendar to the
   * selected date's month, and smooth-scrolls the carousel to center the card.
   * Never touches state inside a scroll handler — selection only happens
   * through clicks (card click, arrow click).
   */
  function selectIndex(index) {
    const clamped = Math.max(0, Math.min(BOOKED_DATE_OBJECTS.length - 1, index));
    setActiveIndex(clamped);
    setCalMonthOffset(0);   /* jump calendar back to the selected month */

    const track = trackRef.current;
    if (!track) return;
    const card = track.children[clamped];
    if (!card) return;

    isScrolling.current = true;
    card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

    window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      isScrolling.current = false;
    }, 600);
  }

  /* Scroll the first card into the visual center on mount — DOM-only side effect,
     no setState needed since activeIndex initialises to 0 already */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[0];
    if (card) card.scrollIntoView({ behavior: "instant", inline: "center", block: "nearest" });
  }, []);

  /* ─── Calendar derived state ─────────────────────────────────── */
  const calBase    = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + calMonthOffset, 1);
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
            {BOOKED_DATE_OBJECTS.map((date, index) => (
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
            disabled={activeIndex === BOOKED_DATE_OBJECTS.length - 1}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Mini calendar */}
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
              const isBooked = BOOKED_SET.has(cellKey);
              const isToday  = cellKey === TODAY_KEY;
              const isHigh   = cellKey === selectedKey;

              let cls = "miniCalendarDay";
              if (isBooked) cls += " miniCalendarDayBooked";
              if (isToday)  cls += " miniCalendarDayToday";
              if (isHigh)   cls += " miniCalendarDayHighlighted";

              return (
                <span key={cellKey} className={cls}>
                  {day}
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
              <span className="miniCalendarLegendDot miniCalendarLegendDotToday" />
              Today
            </span>
            <span className="miniCalendarLegendItem">
              <span className="miniCalendarLegendDot miniCalendarLegendDotAvailable" />
              Available
            </span>
          </div>
        </div>

      </div>
    </section>
  );
}