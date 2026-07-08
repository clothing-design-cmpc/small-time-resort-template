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
 * 1. On mount, generates the next 45 days starting today (the date range
 *    itself is always dynamic — it's simply "today onward")
 * 2. Also on mount, fetches GET /api/bookings/dates — the same endpoint
 *    BookedDatesSection uses — so this picker marks/disables any date
 *    that's already reserved instead of only showing plain future days
 * 3. User scrolls/drags/swipes the strip, or taps the left/right arrows
 * 4. A scroll listener finds whichever date card is nearest the center
 *    of the viewport and marks it active (throttled via requestAnimationFrame)
 * 5. Clicking a date directly scrolls it to center and marks it active —
 *    booked dates are not clickable and are skipped by the arrow buttons
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

/* Local-date YYYY-MM-DD key — matches the format /api/bookings/dates returns */
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
  const [bookedDateSet, setBookedDateSet] = useState(new Set());
  const trackRef = useRef(null);
  const isProgrammaticScroll = useRef(false);
  const releaseScrollGuardTimer = useRef(null);

  /*
   * centerCardInTrack
   * Scrolls only the carousel track's own horizontal scrollbar — never
   * calls scrollIntoView, which also scrolls the page's vertical axis to
   * bring an off-screen section into view. That was the root cause of
   * the page loading scrolled down to between Booked Dates and this
   * section instead of staying on the Hero section.
   */
  const centerCardInTrack = useCallback((track, card, behavior) => {
    if (!track || !card) return;
    const targetLeft = card.offsetLeft - track.clientWidth / 2 + card.clientWidth / 2;
    track.scrollTo({ left: targetLeft, behavior });
  }, []);

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
    centerCardInTrack(track, card, "smooth");
    setActiveIndex(index);

    // Release the guard once the smooth scroll has had time to settle
    window.clearTimeout(releaseScrollGuardTimer.current);
    releaseScrollGuardTimer.current = window.setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 500);
  }, [centerCardInTrack]);

  /*
   * findNextAvailableIndex
   * Steps in the given direction (+1 or -1) from startIndex until it
   * lands on a date that isn't in bookedDateSet, or runs off either end.
   * Keeps the arrow buttons from stopping on an already-reserved date.
   */
  function findNextAvailableIndex(startIndex, direction) {
    let index = startIndex;
    while (index >= 0 && index <= dates.length - 1) {
      if (!bookedDateSet.has(toDateKey(dates[index]))) return index;
      index += direction;
    }
    return startIndex;
  }

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

  /*
   * Fetch booked dates on mount — same endpoint BookedDatesSection uses —
   * so this picker can mark/disable dates that are already reserved.
   * Silently keeps every date selectable if the fetch fails; the picker
   * is still usable, it just can't cross-check availability that moment.
   */
  useEffect(() => {
    let isCancelled = false;

    async function fetchBookedDates() {
      try {
        const response = await fetch("/api/bookings/dates");
        const result = await response.json();
        if (!isCancelled && result.success) {
          setBookedDateSet(new Set(result.data.bookedDates));
        }
      } catch {
        // Network failure — leave bookedDateSet empty rather than blocking the picker
      }
    }

    fetchBookedDates();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Center the first available date on mount so the carousel opens with an active selection already centered
  useEffect(() => {
    const startIndex = findNextAvailableIndex(0, 1);
    scrollToIndex(startIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookedDateSet]);

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
          onClick={() => scrollToIndex(findNextAvailableIndex(Math.max(0, activeIndex - 1), -1))}
          disabled={activeIndex === 0}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="dateCarouselTrack" ref={trackRef} role="listbox" aria-label="Select a check-in date">
          {dates.map((date, index) => {
            const isActive = index === activeIndex;
            const isBooked = bookedDateSet.has(toDateKey(date));
            return (
              <button
                key={date.toISOString()}
                type="button"
                role="option"
                aria-selected={isActive}
                aria-disabled={isBooked}
                disabled={isBooked}
                className={`dateCard${isActive ? " dateCardActive" : ""}${isBooked ? " dateCardBooked" : ""}`}
                onClick={() => !isBooked && scrollToIndex(index)}
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
          onClick={() => scrollToIndex(findNextAvailableIndex(Math.min(dates.length - 1, activeIndex + 1), 1))}
          disabled={activeIndex === dates.length - 1}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <a href={`/visitor/booking?checkin=${toDateKey(activeDate)}`} className="dateCarouselSubmit">
        Continue with this date
      </a>
    </div>
  );
}
