/**
 * FILE: components/sections/HowToBookSection.jsx
 * ROLE: Visitor — public, no auth required
 *
 * PURPOSE:
 * The homepage's Availability area — this is now the ONLY availability
 * calendar on the homepage (it replaces the old "Ready to Book" date
 * carousel, which was removed). Shows a short 3-step guide plus an
 * interactive calendar (same visual language BookedDatesSection's mini
 * calendar used) that lets a visitor tap open dates to build a
 * selection, then continue into the booking form with those dates
 * pre-filled.
 *
 * Selection mode depends on what the CURRENTLY ACTIVE booking rule
 * actually allows (fetched from GET /api/booking-rules, same source
 * BookingFormClient.jsx uses to build its bookingType pills):
 *   - allowOvernightStay === true  -> multi-date RANGE selection (a
 *     stay needs a check-in and check-out night)
 *   - allowOvernightStay === false (only Day Tour and/or Night Tour
 *     enabled) -> SINGLE-date selection only. Tour bookings are a
 *     same-day, no-room visit — there is no such thing as a "check-out"
 *     date for them, and no rule exists to price a multi-date Tour
 *     selection, so letting a visitor tap two dates here previously
 *     produced a nonsensical "2 dates selected" state with nothing on
 *     the backend able to make sense of the second date.
 *
 * DATA FLOW:
 * 1. Rendered inside app/visitor/page.jsx, right before BookedDatesSection
 * 2. On mount, fetches GET /api/bookings/dates (same endpoint
 *    BookedDatesSection uses) to know which dates are already reserved,
 *    AND GET /api/booking-rules to know whether Overnight Stay is
 *    currently enabled (controls single vs. range selection above)
 * 3. Tapping an open (not booked, not past) day toggles it in/out of the
 *    visitor's selection when overnight stays are enabled (multiple
 *    dates at once); when only Tour types are enabled, tapping a day
 *    simply replaces whatever was previously selected
 * 4. "Continue" first checks GET /api/booking-rules to confirm there is
 *    an active booking rule set AND that the selected date range's
 *    night count actually fits that rule's minNightsRequired/
 *    maxNightsAllowed (Overnight Stay) — or, for single-date Tour
 *    selections, that at least one Tour type is enabled. If nothing in
 *    the database matches the selection, a toast explains that and the
 *    visitor stays on this page. If a match exists, the visitor is sent
 *    to /visitor/booking with the earliest selected date as check-in
 *    and the latest as check-out (same date twice if only one day was
 *    picked, which is now the only possibility when Overnight Stay
 *    isn't enabled)
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/visitor/shared/useToast";
import ToastStack from "@/app/visitor/shared/ToastStack";
import axios from "axios";
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
  { number: 1, title: "Pick your dates", body: "Tap one or more open days on the calendar below." },
  { number: 2, title: "Choose your villa", body: "See what's available and pick the one that fits your group." },
  { number: 3, title: "Confirm & pay", body: "Fill in your details and secure your stay online." },
];

export default function HowToBookSection() {
  const router = useRouter();
  const { toasts, showToast, dismissToast } = useToast();
  const [bookedDates, setBookedDates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDates, setSelectedDates] = useState([]);
  const [isCheckingRule, setIsCheckingRule] = useState(false);
  // Whether the currently active booking rule allows Overnight Stay.
  // Defaults to true (the old, permissive behavior) until the fetch
  // below resolves, then flips to false the moment we learn only
  // Tour-type bookings are enabled — see the file header for why that
  // matters for date selection.
  const [allowOvernightStay, setAllowOvernightStay] = useState(true);

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

  // Learn whether Overnight Stay is currently enabled on the active
  // rule — this decides single-date vs. multi-date range selection
  // below. A failed fetch or a missing rule intentionally falls back
  // to single-date-only (the safer default — see file header): if we
  // don't actually know an overnight rule exists, we shouldn't let a
  // visitor build a range the backend has nothing to price.
  useEffect(() => {
    let isCancelled = false;

    async function fetchActiveRule() {
      try {
        const response = await axios.get("/api/booking-rules");
        if (isCancelled) return;
        setAllowOvernightStay(Boolean(response.data?.data?.allowOvernightStay));
      } catch {
        if (!isCancelled) setAllowOvernightStay(false);
      }
    }

    fetchActiveRule();
    return () => {
      isCancelled = true;
    };
  }, []);

  const bookedSet = useMemo(() => new Set(bookedDates), [bookedDates]);
  const selectedSet = useMemo(() => new Set(selectedDates), [selectedDates]);

  const calBase = new Date(TODAY.getFullYear(), TODAY.getMonth() + monthOffset, 1);
  const calYear = calBase.getFullYear();
  const calMonth = calBase.getMonth();
  const firstDay = new Date(calYear, calMonth, 1);
  const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
  const leadBlanks = firstDay.getDay();
  const calLabel = MONTH_YEAR_FMT.format(calBase);

  // Toggles an open date in/out of the visitor's selection when
  // Overnight Stay is enabled (guests can build a multi-date stay
  // range). When only Tour-type bookings are enabled, a Tour is a
  // single same-day visit — every click simply replaces whatever was
  // selected before, so the visitor can never end up with 2+ dates
  // selected for a booking type that has no way to use a second date.
  function handleDayClick(cellKey, isPast, isBooked) {
    if (isPast || isBooked) return;

    if (!allowOvernightStay) {
      setSelectedDates((current) => (current.length === 1 && current[0] === cellKey ? [] : [cellKey]));
      return;
    }

    setSelectedDates((current) =>
      current.includes(cellKey) ? current.filter((key) => key !== cellKey) : [...current, cellKey].sort()
    );
  }

  // Before sending the visitor into the reservation flow, confirm the
  // ACTUAL selected date range is bookable — not just that some rule
  // exists, but that its allowed booking type covers this selection
  // (Overnight Stay: night count within minNightsRequired/
  // maxNightsAllowed; Tour: at least one Tour type enabled).
  async function handleContinue() {
    if (selectedDates.length === 0) return;
    setIsCheckingRule(true);
    try {
      const response = await axios.get("/api/booking-rules");
      const rule = response.data?.data;
      if (!response.data?.success || !rule) {
        showToast("✕ No existing booking rule found. Please try again later.", "error");
        return;
      }

      const sortedDates = [...selectedDates].sort();
      const checkInKey = sortedDates[0];
      const checkOutKey = sortedDates[sortedDates.length - 1];
      const nightsSelected = sortedDates.length - 1;

      if (allowOvernightStay) {
        // Multi-date range — the night count must fall inside this
        // rule's configured min/max for an Overnight stay.
        const minNights = rule.minNightsRequired ?? 1;
        const maxNights = rule.maxNightsAllowed ?? Infinity;

        if (!rule.allowOvernightStay) {
          showToast("✕ Overnight stays aren't available right now. Please try again later.", "error");
          return;
        }
        if (nightsSelected < minNights || nightsSelected > maxNights) {
          const rangeLabel = minNights === maxNights ? `${minNights}` : `${minNights}–${maxNights}`;
          showToast(`✕ No package covers ${nightsSelected} night(s). Available range is ${rangeLabel} night(s) — please adjust your dates.`, "error");
          return;
        }
      } else {
        // Single-date selection — at least one Tour type must be enabled.
        if (!rule.allowDayTour && !rule.allowNightTour) {
          showToast("✕ No tour booking is available right now. Please try again later.", "error");
          return;
        }
      }

      const params = new URLSearchParams({ checkin: checkInKey });
      if (checkOutKey !== checkInKey) params.set("checkout", checkOutKey);

      router.push(`/visitor/booking?${params.toString()}`);
    } catch {
      showToast("✕ No existing booking rule found. Please try again later.", "error");
    } finally {
      setIsCheckingRule(false);
    }
  }

  return (
    <section className="howToBookSection">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <div className="howToBookContainer">
        <div className="howToBookHeader">
          <span className="howToBookEyebrow">Availability</span>
          <h2 className="howToBookTitle">How to Book</h2>
          <p className="howToBookSubtitle">Three quick steps — pick your dates below to get started.</p>
        </div>

        <div className="howToBookSteps">
          {STEPS.map((step) => (
            <div key={step.number} className="howToBookStep">
              <span className="howToBookStepNumber">{step.number}</span>
              <div>
                <p className="howToBookStepTitle">{step.title}</p>
                <p className="howToBookStepBody">
                  {step.number === 1 && !allowOvernightStay
                    ? "Tap an open day on the calendar below — Tour bookings are single-day."
                    : step.body}
                </p>
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
                const isSelected = selectedSet.has(cellKey);

                let cls = "howToBookCalendarDay";
                if (isBooked) cls += " howToBookCalendarDayBooked";
                if (isPast && !isBooked) cls += " howToBookCalendarDayPast";
                if (isToday) cls += " howToBookCalendarDayToday";
                if (isOpen) cls += " howToBookCalendarDayOpen";
                if (isSelected) cls += " howToBookCalendarDaySelected";

                return (
                  <button
                    key={cellKey}
                    type="button"
                    className={cls}
                    disabled={!isOpen}
                    aria-pressed={isOpen ? isSelected : undefined}
                    aria-label={isOpen ? `${isSelected ? "Deselect" : "Select"} ${cellKey}` : undefined}
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
                Open — tap to select
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

            <div className="howToBookSelectionRow">
              <p className="howToBookSelectionSummary">
                {selectedDates.length === 0
                  ? "No dates selected yet."
                  : `${selectedDates.length} date${selectedDates.length > 1 ? "s" : ""} selected.`}
              </p>
              <button
                type="button"
                className="howToBookContinueButton"
                disabled={selectedDates.length === 0 || isCheckingRule}
                onClick={handleContinue}
              >
                {isCheckingRule ? "Checking…" : "Continue"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}