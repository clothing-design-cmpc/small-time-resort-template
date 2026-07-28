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
 *    an active booking rule set AND that the selection is bookable —
 *    for single-date Tour-only selections, that at least one Tour type
 *    is enabled. If nothing in the database matches the selection, a
 *    toast explains that and the visitor stays on this page.
 * 5. When Overnight Stay is enabled and EXACTLY ONE date is selected,
 *    the booking type is ambiguous — it could become a 1-night
 *    Overnight stay, a Day Tour, or a Night Tour. RoomSelectionModal
 *    still opens first (useful even for a Tour visitor picking a villa
 *    to enjoy for the day/evening), but instead of routing straight
 *    through, TourSelectionModal opens next so the visitor picks the
 *    actual type — see handleRoomSelected() and
 *    handleTourTypeSelected() below.
 * 6. When 2+ dates are selected, there is no ambiguity — it can only
 *    ever be an Overnight stay, so once a room is picked the visitor
 *    routes straight to /visitor/booking with the earliest selected
 *    date as check-in and the latest as check-out.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/visitor/shared/useToast";
import ToastStack from "@/app/visitor/shared/ToastStack";
import RoomSelectionModal from "@/components/RoomSelectionModal";
import TourSelectionModal from "@/components/TourSelectionModal";
import { useAvailableRooms } from "@/hooks/useAvailableRooms";
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

/**
 * addOneDayKey
 * Returns the "YYYY-MM-DD" key for the day after the given key. Mirrors
 * the same convention the admin's Booking Rules form already uses
 * (BookingRuleForm.jsx -> addOneDay()): the actual check-out date for
 * an N-night stay is the day AFTER the Nth selected/occupied night —
 * see the nightsSelected comment in handleContinue() below for why
 * this matters for matching the correct rule set.
 */
function addOneDayKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return toKey(new Date(year, month - 1, day + 1));
}

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const TODAY_KEY = toKey(TODAY);

/**
 * getDateRangeKeys
 * Given two "YYYY-MM-DD" keys in any order, returns every date key from
 * the earlier one to the later one, inclusive. Used below so that
 * tapping a second date fills in every day in between (e.g. tapping
 * July 24 then July 26 selects July 24, 25, and 26 — not just the two
 * endpoints).
 */
function getDateRangeKeys(keyA, keyB) {
  const [startKey, endKey] = [keyA, keyB].sort();
  const [startYear, startMonth, startDay] = startKey.split("-").map(Number);
  const [endYear, endMonth, endDay] = endKey.split("-").map(Number);
  const cursor = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);

  const keys = [];
  while (cursor <= end) {
    keys.push(toKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

const STEPS = [
  { number: 1, title: "Pick your dates", body: "Tap one or more open days on the calendar below." },
  { number: 2, title: "Choose your room", body: "See what's available and pick the one that fits your group." },
  { number: 3, title: "Confirm & pay", body: "Fill in your details and secure your stay online." },
];

/**
 * getTodayTourAvailability
 * When the single selected date is TODAY, which tour types make sense
 * depends on the current time of day — a Day Tour can't reasonably
 * start after most of the day is already gone. Only ever narrows
 * (never widens) whatever allowDayTour/allowNightTour the active
 * booking rule already permits:
 *   - 12:00 AM – 11:59 AM -> no time-based restriction (all rule-
 *     permitted types stay available; there's a full day ahead).
 *   - 12:00 PM – 9:59 PM  -> Day Tour is hidden; only Night Tour and
 *     Overnight remain (whichever of those the rule already allows).
 *   - 10:00 PM – 11:59 PM -> same restriction as the 12 PM–10 PM
 *     window (Day Tour hidden) — a Day Tour makes even less sense
 *     this late, and no separate band was specified for it.
 * Only applies to TODAY — future dates are unaffected regardless of
 * the current time.
 */
function getTodayTourAvailability(checkInKey, ruleAllowDayTour, ruleAllowNightTour) {
  if (checkInKey !== TODAY_KEY) {
    return { allowDayTour: ruleAllowDayTour, allowNightTour: ruleAllowNightTour };
  }
  const currentHour = new Date().getHours();
  const isPastNoon = currentHour >= 12;
  return {
    allowDayTour: isPastNoon ? false : ruleAllowDayTour,
    allowNightTour: ruleAllowNightTour,
  };
}

export default function HowToBookSection() {
  const router = useRouter();
  const { toasts, showToast, dismissToast } = useToast();
  // Booked dates broken out per booking type — see the exclusivity rule
  // in app/api/bookings/dates/route.js's file header: Overnight blocks
  // every other type on that date; Day Tour and Night Tour coexist
  // freely with each other but each still conflicts with an existing
  // Overnight booking. Kept as three separate sets (rather than one
  // flat "booked" list) so the calendar and the ambiguous single-date
  // TourSelectionModal flow can apply the correct rule instead of
  // treating any booking as blocking every type.
  const [overnightBookedDates, setOvernightBookedDates] = useState([]);
  const [dayTourBookedDates, setDayTourBookedDates] = useState([]);
  const [nightTourBookedDates, setNightTourBookedDates] = useState([]);
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

  // Set only once the Overnight rule check in handleContinue() below has
  // passed for the visitor's selected dates — opens RoomSelectionModal
  // with exactly the checkIn/checkOut/ruleId it needs. null = modal closed.
  // singleDateFlow (true only when exactly 1 date was selected) tells
  // handleRoomSelected() below whether to route straight through
  // (2+ dates -> always Overnight) or open TourSelectionModal next
  // (1 date -> ambiguous between Overnight/Day Tour/Night Tour).
  const [roomModalRequest, setRoomModalRequest] = useState(null);
  const { rooms: availableRooms, isLoading: isLoadingRooms, error: availableRoomsError } = useAvailableRooms(
    roomModalRequest?.checkInDate ?? null,
    roomModalRequest?.checkOutDate ?? null
  );

  // Set once a room has been picked for a single-date selection — opens
  // TourSelectionModal so the visitor can say whether this single date
  // is actually an Overnight stay, a Day Tour, or a Night Tour. null =
  // modal closed. Never set when 2+ dates were selected (that case
  // routes straight through as Overnight — see handleRoomSelected()).
  const [tourSelectionRequest, setTourSelectionRequest] = useState(null);

  // Fetch which dates are already reserved, broken out per type — same
  // source of truth as BookedDatesSection, kept as its own independent
  // fetch so this component has no hard dependency on that one.
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
        setOvernightBookedDates(result.data.overnightBookedDates);
        setDayTourBookedDates(result.data.dayTourBookedDates);
        setNightTourBookedDates(result.data.nightTourBookedDates);
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

  const overnightSet = useMemo(() => new Set(overnightBookedDates), [overnightBookedDates]);
  const dayTourSet = useMemo(() => new Set(dayTourBookedDates), [dayTourBookedDates]);
  const nightTourSet = useMemo(() => new Set(nightTourBookedDates), [nightTourBookedDates]);
  // Any existing booking of any type on a date — a multi-date selection
  // is always an Overnight stay (see file header), and Overnight
  // conflicts with an existing booking of ANY type on that date, so
  // this combined set is what range-crossing and single-date ambiguity
  // checks need, rather than just the Overnight-only set below.
  const anyBookedSet = useMemo(
    () => new Set([...overnightSet, ...dayTourSet, ...nightTourSet]),
    [overnightSet, dayTourSet, nightTourSet]
  );
  // Calendar cells only render as fully blocked (red, unclickable) when
  // an Overnight booking exists there — a date with just a Day Tour
  // and/or Night Tour booking stays open, since the other tour type
  // (or another same-type visit) can still be booked on it. See the
  // exclusivity rule in app/api/bookings/dates/route.js's file header.
  const bookedSet = overnightSet;
  const selectedSet = useMemo(() => new Set(selectedDates), [selectedDates]);

  const calBase = new Date(TODAY.getFullYear(), TODAY.getMonth() + monthOffset, 1);
  const calYear = calBase.getFullYear();
  const calMonth = calBase.getMonth();
  const firstDay = new Date(calYear, calMonth, 1);
  const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
  const leadBlanks = firstDay.getDay();
  const calLabel = MONTH_YEAR_FMT.format(calBase);

  // Section 1's calendar click behavior when Overnight Stay is enabled
  // (mirrors the same pattern used on the super-admin Booking Rules
  // date picker):
  //   - No date selected yet -> selects just the clicked date (range anchor).
  //   - Exactly one date already selected -> clicking the SAME date
  //     deselects it; clicking a DIFFERENT date fills in every date
  //     between the anchor and this click, inclusive (e.g. July 24
  //     selected, then July 26 clicked -> July 24, 25, 26 all selected).
  //   - A range/multiple dates are already selected -> clicking any
  //     date starts a fresh selection with just that date as the new
  //     anchor, so the visitor can redo the range without clicking
  //     every day off one at a time.
  // When only Tour-type bookings are enabled, a Tour is a single
  // same-day visit — every click simply replaces whatever was selected
  // before, so the visitor can never end up with 2+ dates selected for
  // a booking type that has no way to use a second date.
  function handleDayClick(cellKey, isPast, isBooked) {
    if (isPast || isBooked) return;

    if (!allowOvernightStay) {
      setSelectedDates((current) => (current.length === 1 && current[0] === cellKey ? [] : [cellKey]));
      return;
    }

    if (selectedDates.length === 0) {
      setSelectedDates([cellKey]);
      return;
    }

    if (selectedDates.length === 1) {
      const anchorKey = selectedDates[0];
      if (anchorKey === cellKey) {
        setSelectedDates([]);
        return;
      }

      const rangeKeys = getDateRangeKeys(anchorKey, cellKey);
      // A multi-date selection is always an Overnight stay, which
      // conflicts with ANY existing booking (Overnight, Day Tour, or
      // Night Tour) on any date it spans — checks every date in the
      // range, including the anchor and clicked endpoint themselves,
      // since those can carry a Day/Night Tour booking that the
      // Overnight-only bookedSet above wouldn't have caught at click time.
      const crossesBookedDate = rangeKeys.some((key) => anyBookedSet.has(key));
      if (crossesBookedDate) {
        showToast("✕ That range crosses an already booked date. Please pick a different range.", "error");
        return;
      }

      setSelectedDates(rangeKeys);
      return;
    }

    // A range/multiple dates are already selected — start fresh.
    setSelectedDates([cellKey]);
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
      const sortedDates = [...selectedDates].sort();
      const checkInKey = sortedDates[0];
      // CONVENTION: each selected calendar day is one OCCUPIED NIGHT
      // (same convention the admin's Booking Rules form uses — see
      // BookingRule.howManySelectedDates comment in prisma/schema.prisma
      // and BookingRuleForm.jsx's addOneDay()). Selecting 3 dates
      // (e.g. Jul 27-29) means a 3-night stay ("4Ds-3Ns"), with the
      // real check-out date being the day AFTER the last occupied
      // night (Jul 30) — NOT the last selected date itself. Using
      // sortedDates.length - 1 here previously matched real calendar
      // day-span math (2 nights for 3 tapped days) instead of this
      // resort's own night-counting convention, so the wrong rule set
      // (e.g. "3Ds-2Ns") was being matched and shown to the visitor.
      const nightsSelected = sortedDates.length;
      const checkOutKey = allowOvernightStay
        ? addOneDayKey(sortedDates[sortedDates.length - 1])
        : sortedDates[sortedDates.length - 1];

      // Passing nights here matches the SAME rule set (e.g. "4Ds-3Ns")
      // the booking page will resolve for this stay — see
      // app/api/booking-rules/route.js and usePublicBookingRules.js.
      const response = await axios.get("/api/booking-rules", {
        params: allowOvernightStay && nightsSelected > 0 ? { nights: nightsSelected } : {},
      });
      const rule = response.data?.data;
      if (!response.data?.success || !rule) {
        showToast("✕ No existing booking rule found. Please try again later.", "error");
        return;
      }

      if (allowOvernightStay) {
        const minNights = rule.minNightsRequired ?? 1;
        const maxNights = rule.maxNightsAllowed ?? Infinity;
        const overnightFits = rule.allowOvernightStay && nightsSelected >= minNights && nightsSelected <= maxNights;

        if (nightsSelected === 1) {
          // Exactly ONE date selected — ambiguous between Overnight (1
          // night), Day Tour, or Night Tour. When the selected date is
          // TODAY, narrow Day Tour/Night Tour further based on the
          // current time — see getTodayTourAvailability() above.
          const { allowDayTour: timeAllowsDayTour, allowNightTour: timeAllowsNightTour } =
            getTodayTourAvailability(checkInKey, rule.allowDayTour, rule.allowNightTour);

          // Exclusivity rule (see app/api/bookings/dates/route.js's file
          // header): an existing booking of ANY type on this date blocks
          // a NEW Overnight booking here, since Overnight is exclusive
          // use of the villa. An existing OVERNIGHT booking blocks both
          // Tour types too. Day Tour and Night Tour don't block each
          // other — a date already carrying one of those still allows
          // the other. (The Overnight-booking case below is normally
          // unreachable since such a date is already unclickable on the
          // calendar — kept anyway as defense-in-depth.)
          const dateHasOvernightBooking = overnightSet.has(checkInKey);
          const dateHasAnyExistingBooking = anyBookedSet.has(checkInKey);
          const conflictAdjustedOvernightFits = overnightFits && !dateHasAnyExistingBooking;
          const conflictAdjustedAllowDayTour = timeAllowsDayTour && !dateHasOvernightBooking;
          const conflictAdjustedAllowNightTour = timeAllowsNightTour && !dateHasOvernightBooking;

          // Open Room Selection first (useful even for a Tour visitor
          // picking a villa to enjoy for the day/evening), then
          // TourSelectionModal decides the actual booking type — see
          // handleRoomSelected() below.
          if (!conflictAdjustedOvernightFits && !conflictAdjustedAllowDayTour && !conflictAdjustedAllowNightTour) {
            showToast("✕ No booking type is available for this date right now. Please try again later.", "error");
            return;
          }
          setRoomModalRequest({
            checkInDate: checkInKey,
            checkOutDate: checkOutKey,
            ruleId: rule.matchedRuleId,
            singleDateFlow: true,
            allowOvernightStay: conflictAdjustedOvernightFits,
            allowDayTour: conflictAdjustedAllowDayTour,
            allowNightTour: conflictAdjustedAllowNightTour,
            dayTourPricePerGuest: rule.dayTourPricePerGuest,
            nightTourPricePerGuest: rule.nightTourPricePerGuest,
          });
          return;
        }

        // 2+ dates selected — no ambiguity, this can only ever be an
        // Overnight stay, so it must fit this rule's configured
        // min/max nights.
        if (!rule.allowOvernightStay) {
          showToast("✕ Overnight stays aren't available right now. Please try again later.", "error");
          return;
        }
        if (!overnightFits) {
          const rangeLabel = minNights === maxNights ? `${minNights}` : `${minNights}–${maxNights}`;
          showToast(`✕ No package covers ${nightsSelected} night(s). Available range is ${rangeLabel} night(s) — please adjust your dates.`, "error");
          return;
        }

        // Rule confirmed for these dates — open the room-selection
        // modal instead of routing straight to the reservation page.
        // The visitor picks a room there; handleRoomSelected() below
        // does the actual navigation once they do (singleDateFlow is
        // false here, so it routes straight through as Overnight).
        setRoomModalRequest({ checkInDate: checkInKey, checkOutDate: checkOutKey, ruleId: rule.matchedRuleId, singleDateFlow: false });
        return;
      } else {
        // Single-date selection — at least one Tour type must be enabled.
        if (!rule.allowDayTour && !rule.allowNightTour) {
          showToast("✕ No tour booking is available right now. Please try again later.", "error");
          return;
        }
      }

      // Tour path only reaches here — Overnight returns above once the
      // room modal opens.
      const params = new URLSearchParams({ checkin: checkInKey });
      if (checkOutKey !== checkInKey) params.set("checkout", checkOutKey);

      router.push(`/visitor/booking?${params.toString()}`);
    } catch {
      showToast("✕ No existing booking rule found. Please try again later.", "error");
    } finally {
      setIsCheckingRule(false);
    }
  }

  /**
   * handleRoomSelected
   * Fired when the visitor taps a room inside RoomSelectionModal.
   * When 2+ dates were selected (singleDateFlow false), this is
   * unambiguously an Overnight stay — closes the modal and routes
   * straight into the read-only reservation summary with
   * checkin/checkout/roomId/ruleId all pre-filled — see
   * app/visitor/booking/page.jsx + ReservationSummaryClient.jsx.
   * When exactly 1 date was selected (singleDateFlow true), the
   * booking type is still ambiguous — opens TourSelectionModal next
   * instead of routing, so the visitor can say whether this is
   * actually Overnight, Day Tour, or Night Tour.
   */
  function handleRoomSelected(room) {
    if (!roomModalRequest) return;

    if (roomModalRequest.singleDateFlow) {
      setTourSelectionRequest({
        checkInDate: roomModalRequest.checkInDate,
        checkOutDate: roomModalRequest.checkOutDate,
        ruleId: roomModalRequest.ruleId,
        room,
        allowOvernightStay: roomModalRequest.allowOvernightStay,
        allowDayTour: roomModalRequest.allowDayTour,
        allowNightTour: roomModalRequest.allowNightTour,
        dayTourPricePerGuest: roomModalRequest.dayTourPricePerGuest,
        nightTourPricePerGuest: roomModalRequest.nightTourPricePerGuest,
      });
      setRoomModalRequest(null);
      return;
    }

    const params = new URLSearchParams({
      checkin: roomModalRequest.checkInDate,
      roomId: room.id,
    });
    if (roomModalRequest.checkOutDate !== roomModalRequest.checkInDate) {
      params.set("checkout", roomModalRequest.checkOutDate);
    }
    if (roomModalRequest.ruleId) params.set("ruleId", roomModalRequest.ruleId);
    setRoomModalRequest(null);
    router.push(`/visitor/booking?${params.toString()}`);
  }

  /**
   * handleTourTypeSelected
   * Fired when the visitor taps a booking type inside
   * TourSelectionModal (only ever shown for a single selected date).
   * "overnight" routes into the same read-only reservation summary as
   * the 2+ dates path, using the room already picked. "day_tour" /
   * "night_tour" have no room or checkout — routes into the plain
   * booking form with ?type= so it can lock straight to that type
   * instead of showing the Overnight/Day Tour/Night Tour pills again.
   */
  function handleTourTypeSelected(type) {
    if (!tourSelectionRequest) return;
    const { checkInDate, checkOutDate, ruleId, room } = tourSelectionRequest;

    if (type === "overnight") {
      const params = new URLSearchParams({ checkin: checkInDate, roomId: room.id });
      if (checkOutDate !== checkInDate) params.set("checkout", checkOutDate);
      if (ruleId) params.set("ruleId", ruleId);
      setTourSelectionRequest(null);
      router.push(`/visitor/booking?${params.toString()}`);
      return;
    }

    const params = new URLSearchParams({ checkin: checkInDate, type });
    setTourSelectionRequest(null);
    router.push(`/visitor/booking?${params.toString()}`);
  }

  return (
    <section id="how-to-book" className="howToBookSection">
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

      <RoomSelectionModal
        isOpen={Boolean(roomModalRequest)}
        checkInDate={roomModalRequest?.checkInDate}
        checkOutDate={roomModalRequest?.checkOutDate}
        rooms={availableRooms}
        isLoading={isLoadingRooms}
        error={availableRoomsError}
        onSelectRoom={handleRoomSelected}
        onClose={() => setRoomModalRequest(null)}
      />

      <TourSelectionModal
        isOpen={Boolean(tourSelectionRequest)}
        checkInDate={tourSelectionRequest?.checkInDate}
        room={tourSelectionRequest?.room}
        allowOvernightStay={tourSelectionRequest?.allowOvernightStay}
        allowDayTour={tourSelectionRequest?.allowDayTour}
        allowNightTour={tourSelectionRequest?.allowNightTour}
        dayTourPricePerGuest={tourSelectionRequest?.dayTourPricePerGuest}
        nightTourPricePerGuest={tourSelectionRequest?.nightTourPricePerGuest}
        onSelectType={handleTourTypeSelected}
        onClose={() => setTourSelectionRequest(null)}
      />
    </section>
  );
}