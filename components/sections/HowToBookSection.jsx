/**
 * FILE: components/sections/HowToBookSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * "How to Book" guide for the homepage's Availability area, sitting
 * alongside BookedDatesSection. Instead of plain numbered instructions,
 * this shows a short 3-step guide plus an interactive mini calendar
 * (same visual language as BookedDatesSection's miniCalendar) that lets
 * a visitor tap any open date to jump straight into the booking form
 * with that date pre-filled.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx, right before BookedDatesSection
 * 2. On mount, fetches GET /api/bookings/dates (same endpoint
 *    BookedDatesSection uses) to know which dates are already reserved
 * 3. Clicking an open (not booked, not past) day navigates to
 *    /visitor/booking?checkin=YYYY-MM-DD — no local state needed beyond
 *    the calendar's own month paging
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "./HowToBookSection.css";

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

const STEPS = [
  { number: 1, title: "Pick a date", body: "Tap any open day on the calendar below." },
  { number: 2, title: "Choose your villa", body: "See what's available and pick the one that fits your group." },
  { number: 3, title: "Confirm & pay", body: "Fill in your details and secure your stay online." },
];

export default function HowToBookSection() {
  const router = useRouter();
  const [bookedDates, setBookedDates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [monthOffset, setMonthOffset] = useState(0);

  // Fetch which dates are already reserved — same source of truth as
  // BookedDatesSection, kept as its own independent fetch so this
  // component has no hard dependency on that one.
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
          setLoadError(result.message || "Failed to load availability. Please try again.");
          return;
        }
        setBookedDates(result.data.bookedDates);
      } catch {
        if (!isCancelled) setLoadError("We couldn't reach the server. Check your connection and try again.");
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    fetchBookedDates();
    return () => {
      isCancelled = true;
    };
  }, []);

  const bookedSet = useMemo(() => new Set(bookedDates), [bookedDates]);

  const calBase = new Date(TODAY.getFullYear(), TODAY.getMonth() + monthOffset, 1);
  const calYear = calBase.getFullYear();
  const calMonth = calBase.getMonth();
  const firstDay = new Date(calYear, calMonth, 1);
  const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
  const leadBlanks = firstDay.getDay();
  const calLabel = MONTH_YEAR_FMT.format(calBase);

  // Clicking an open date sends the visitor straight into the booking
  // form with that date pre-filled — mirrors DateCarousel's own
  // ?checkin= link pattern on the booking page.
  function handleDayClick(cellKey, isPast, isBooked) {
    if (isPast || isBooked) return;
    router.push(`/visitor/booking?checkin=${cellKey}`);
  }

  return (
    <section className="howToBookSection">
      <div className="howToBookContainer">
        <div className="howToBookHeader">
          <span className="howToBookEyebrow">Availability</span>
          <h2 className="howToBookTitle">How to Book</h2>
          <p className="howToBookSubtitle">Three quick steps — pick a date below to get started.</p>
        </div>

        <div className="howToBookSteps">
          {STEPS.map((step) => (
            <div key={step.number} className="howToBookStep">
              <span className="howToBookStepNumber">{step.number}</span>
              <div>
                <p className="howToBookStepTitle">{step.title}</p>
                <p className="howToBookStepBody">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        {isLoading && <div className="howToBookCalendarSkeleton skeletonBlock" aria-label="Loading availability" />}

        {!isLoading && loadError && (
          <div className="howToBookErrorState">
            <p className="howToBookErrorMessage">{loadError}</p>
          </div>
        )}

        {!isLoading && !loadError && (
          <div className="howToBookCalendar" aria-label={`Availability calendar for ${calLabel}`}>
            <div className="howToBookCalendarHeader">
              <button type="button" className="howToBookCalendarNav" aria-label="Previous month" onClick={() => setMonthOffset((o) => o - 1)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="howToBookCalendarLabel">{calLabel}</span>
              <button type="button" className="howToBookCalendarNav" aria-label="Next month" onClick={() => setMonthOffset((o) => o + 1)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            <div className="howToBookCalendarGrid">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <span key={d} className="howToBookCalendarWeekdayLabel">{d}</span>
              ))}

              {Array.from({ length: leadBlanks }, (_, i) => (
                <span key={`b${i}`} className="howToBookCalendarBlank" />
              ))}

              {Array.from({ length: totalDays }, (_, i) => {
                const day = i + 1;
                const cellDate = new Date(calYear, calMonth, day);
                const cellKey = toKey(cellDate);
                const isBooked = bookedSet.has(cellKey);
                const isToday = cellKey === TODAY_KEY;
                const isPast = cellDate < TODAY;
                const isOpen = !isBooked && !isPast;

                let cls = "howToBookCalendarDay";
                if (isBooked) cls += " howToBookCalendarDayBooked";
                if (isPast && !isBooked) cls += " howToBookCalendarDayPast";
                if (isToday) cls += " howToBookCalendarDayToday";
                if (isOpen) cls += " howToBookCalendarDayOpen";

                return (
                  <button
                    key={cellKey}
                    type="button"
                    className={cls}
                    disabled={!isOpen}
                    aria-label={isOpen ? `Book starting ${cellKey}` : undefined}
                    onClick={() => handleDayClick(cellKey, isPast, isBooked)}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="howToBookCalendarLegend">
              <span className="howToBookCalendarLegendItem">
                <span className="howToBookCalendarLegendDot howToBookCalendarLegendDotOpen" />
                Open — tap to book
              </span>
              <span className="howToBookCalendarLegendItem">
                <span className="howToBookCalendarLegendDot howToBookCalendarLegendDotBooked" />
                Booked
              </span>
              <span className="howToBookCalendarLegendItem">
                <span className="howToBookCalendarLegendDot howToBookCalendarLegendDotToday" />
                Today
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
