/**
 * FILE: components/shared/DateCarousel.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * Replaces the old "Book Your Stay / View Rooms" button row on the
 * homepage CTA section. Renders a horizontally sliding row of upcoming
 * dates the guest can drag, swipe, or arrow through to pick a check-in
 * date. Whichever date lands in the visual center of the strip becomes
 * the "active" date — enlarged, accent-colored, and reflected in the
 * readout line above the carousel.
 *
 * DATA FLOW:
 * 1. On mount, generates the next 45 days starting today (static —
 *    no availability/backend data yet, purely a front-end date picker)
 * 2. User scrolls/drags/swipes the strip, or taps the left/right arrows
 * 3. A scroll listener finds whichever date card is nearest the center
 *    of the viewport and marks it active (throttled via requestAnimationFrame)
 * 4. Clicking a date directly scrolls it to center and marks it active
 */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import "./DateCarousel.css";

const DAYS_TO_SHOW = 45;
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short" });
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

/* Builds an array of the next DAYS_TO_SHOW calendar dates starting today */
function buildUpcomingDates() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: DAYS_TO_SHOW }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return date;
  });
}

export default function DateCarousel() {
  const [dates] = useState(buildUpcomingDates);
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef(null);
  const isProgrammaticScroll = useRef(false);
  const releaseScrollGuardTimer = useRef(null);

  /*
   * scrollToIndex
   * Centers the requested date card inside the scrollable track.
   * Sets isProgrammaticScroll so the scroll listener below doesn't
   * fight this animated scroll while it's in flight.
   */
  const scrollToIndex = useCallback((index) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[index];
    if (!card) return;

    isProgrammaticScroll.current = true;
    card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    setActiveIndex(index);

    // Release the guard once the smooth scroll has had time to settle
    window.clearTimeout(releaseScrollGuardTimer.current);
    releaseScrollGuardTimer.current = window.setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 500);
  }, []);

  /*
   * handleScroll
   * Fires while the user drags/swipes the track. Finds whichever date
   * card's center is closest to the track's own center and marks it
   * active, so the enlarged/highlighted card always matches what's
   * actually centered on screen — even mid-drag.
   */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let rafId = null;

    function handleScroll() {
      // Skip while an arrow/click-triggered smooth scroll is animating
      if (isProgrammaticScroll.current) return;

      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        const trackRect = track.getBoundingClientRect();
        const trackCenter = trackRect.left + trackRect.width / 2;

        let closestIndex = 0;
        let closestDistance = Infinity;

        Array.from(track.children).forEach((card, index) => {
          const cardRect = card.getBoundingClientRect();
          const cardCenter = cardRect.left + cardRect.width / 2;
          const distance = Math.abs(cardCenter - trackCenter);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
          }
        });

        setActiveIndex((current) => (current === closestIndex ? current : closestIndex));
      });
    }

    track.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", handleScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  // Center the first date on mount so the carousel opens with an active selection already centered
  useEffect(() => {
    scrollToIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeDate = dates[activeIndex];

  return (
    <div className="dateCarousel">
      <p className="dateCarouselReadout">
        Check-in: <span className="dateCarouselReadoutValue">{activeDate ? FULL_DATE_FORMATTER.format(activeDate) : ""}</span>
      </p>

      <div className="dateCarouselViewport">
        {/* Previous date arrow */}
        <button
          type="button"
          className="dateCarouselArrow dateCarouselArrowLeft"
          aria-label="Previous date"
          onClick={() => scrollToIndex(Math.max(0, activeIndex - 1))}
          disabled={activeIndex === 0}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="dateCarouselTrack" ref={trackRef} role="listbox" aria-label="Select a check-in date">
          {dates.map((date, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={date.toISOString()}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`dateCard${isActive ? " dateCardActive" : ""}`}
                onClick={() => scrollToIndex(index)}
              >
                <span className="dateCardWeekday">{WEEKDAY_FORMATTER.format(date)}</span>
                <span className="dateCardDay">{date.getDate()}</span>
                <span className="dateCardMonth">{MONTH_FORMATTER.format(date)}</span>
              </button>
            );
          })}
        </div>

        {/* Next date arrow */}
        <button
          type="button"
          className="dateCarouselArrow dateCarouselArrowRight"
          aria-label="Next date"
          onClick={() => scrollToIndex(Math.min(dates.length - 1, activeIndex + 1))}
          disabled={activeIndex === dates.length - 1}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <a href="/visitor/booking" className="dateCarouselSubmit">
        Continue with this date
      </a>
    </div>
  );
}
