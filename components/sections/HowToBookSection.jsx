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
import { formatTime12Hour } from "@/utils/formatTime";
import TourSelectionModal from "@/components/TourSelectionModal";
import { useAvailableRooms } from "@/hooks/useAvailableRooms";
import { useBookedDates } from "@/hooks/useBookedDates";
import axios from "axios";
import "./HowToBookSection.css";

const MONTH_YEAR_FMT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const SHORT_DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/**
 * formatKeyShort
 * Renders a "YYYY-MM-DD" key as "Aug 2" for use inside toast messages.
 * Parsed as local Y/M/D (not Date.parse on the raw string) so it can
 * never drift a day off from what the calendar grid itself shows.
 */
function formatKeyShort(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return SHORT_DATE_FMT.format(new Date(year, month - 1, day));
}

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
  // Overnight booking. Shared hook (also used by BookingFormClient.jsx)
  // so both surfaces apply the exact same blocking rules — including
  // overnightBlocksTourSet, which (unlike overnightSet) also covers the
  // CHECKOUT day of an overnight stay, since checkout time overlaps Day
  // Tour's start.
  const {
    overnightSet,
    dayTourSet,
    nightTourSet,
    overnightCheckoutSet,
    overnightBlocksDayTourSet,
    maintenanceSet,
    anyBookedSet,
    isLoading,
    error: loadError,
  } = useBookedDates();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDates, setSelectedDates] = useState([]);
  const [isCheckingRule, setIsCheckingRule] = useState(false);
  // Whether the currently active booking rule allows Overnight Stay.
  // Defaults to true (the old, permissive behavior) until the fetch
  // below resolves, then flips to false the moment we learn only
  // Tour-type bookings are enabled — see the file header for why that
  // matters for date selection.
  const [allowOvernightStay, setAllowOvernightStay] = useState(true);
  // Active rule's checkout time (e.g. "11:00") — shown on the calendar
  // as a "Checkout {time}" indicator on a date that's the checkout day
  // of an existing overnight stay, so visitors know why a Tour option
  // might be unavailable that day before they even tap Continue.
  const [checkOutTime, setCheckOutTime] = useState(null);
  // Promo Dates (super-admin Booking Rules Section 5b) — a Map of
  // "YYYY-MM-DD" -> array of { discountPercent, appliesTo } for every
  // active, not-yet-past promo date, so the calendar can flag "5% OFF"
  // days the same way it already flags checkout/tour-booked days, AND
  // TourSelectionModal can show which specific tour type(s) a promo on
  // the selected date actually covers. An array (not a single value)
  // because the same date can carry more than one promo scoped to
  // different tour types (e.g. a Day Tour-only promo AND a separate
  // Night Tour-only promo on the same day) — collapsing to one entry
  // would silently drop whichever wasn't fetched last. Fetched from
  // the same public GET /api/promo-dates PromoAlertBanner.jsx uses.
  const [promoMap, setPromoMap] = useState(new Map());

  useEffect(() => {
    let isCancelled = false;

    async function fetchPromoDates() {
      try {
        const response = await axios.get("/api/promo-dates");
        if (isCancelled) return;
        const entries = response.data?.data ?? [];
        const grouped = new Map();
        for (const entry of entries) {
          const dateKey = entry.date.slice(0, 10);
          const list = grouped.get(dateKey) ?? [];
          list.push({ discountPercent: Number(entry.discountPercent), appliesTo: entry.appliesTo });
          grouped.set(dateKey, list);
        }
        setPromoMap(grouped);
      } catch {
        // Fails silently — a broken promo lookup should never block the
        // calendar itself; it just means no promo dots show.
        if (!isCancelled) setPromoMap(new Map());
      }
    }

    fetchPromoDates();
    return () => {
      isCancelled = true;
    };
  }, []);

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

  // Learn whether Overnight Stay is currently enabled on the active
  // rule — this decides single-date vs. multi-date range selection
  // below. A failed fetch or a missing rule intentionally falls back
  // to single-date-only (the safer default — see file header): if we
  // don't actually know an overnight rule exists, we shouldn't let a
  // visitor build a range the backend has nothing to price. Also
  // captures checkOutTime, shown on the calendar as a "Checkout {time}"
  // indicator on a date that's the checkout day of an existing stay.
  useEffect(() => {
    let isCancelled = false;

    async function fetchActiveRule() {
      try {
        const response = await axios.get("/api/booking-rules");
        if (isCancelled) return;
        setAllowOvernightStay(Boolean(response.data?.data?.allowOvernightStay));
        setCheckOutTime(response.data?.data?.checkOutTime ?? null);
      } catch {
        if (!isCancelled) setAllowOvernightStay(false);
      }
    }

    fetchActiveRule();
    return () => {
      isCancelled = true;
    };
  }, []);

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
      // Name the ACTUAL conflicting date(s) rather than a generic message —
      // the date the visitor just clicked (e.g. Aug 3) is often completely
      // open; the real conflict is usually the anchor date itself already
      // carrying an existing Day Tour/Night Tour booking (anyBookedSet
      // covers all booking types, not just Overnight — see bookedSet vs
      // anyBookedSet distinction in the file header above). Without
      // naming which date(s) are the problem, a visitor has no way to
      // tell their newly-clicked day apart from the real cause.
      const conflictingKeys = rangeKeys.filter((key) => anyBookedSet.has(key));
      if (conflictingKeys.length > 0) {
        // Name WHAT is already booked on each conflicting date, not just
        // that something is — "Aug 3 (Day Tour)" tells the visitor
        // exactly why an Overnight range can't cross it, instead of
        // leaving them to guess between Overnight/Day Tour/Night Tour.
        const conflictingLabel = conflictingKeys
          .map((key) => {
            const typeLabel = overnightSet.has(key)
              ? "Overnight"
              : dayTourSet.has(key) && nightTourSet.has(key)
              ? "Day Tour & Night Tour"
              : dayTourSet.has(key)
              ? "Day Tour"
              : "Night Tour";
            return `${formatKeyShort(key)} (${typeLabel})`;
          })
          .join(", ");
        showToast(
          `✕ ${conflictingLabel} already ${conflictingKeys.length > 1 ? "have bookings" : "has a booking"}, so this range can't include ${conflictingKeys.length > 1 ? "them" : "it"}. Please pick a different range.`,
          "error"
        );
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
  // (Overnight Stay: a rule set exists that allows Overnight for this
  // exact night count; Tour: at least one Tour type enabled).
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
        console.error("[HowToBookSection] /api/booking-rules returned failure:", response.data);
        showToast(`✕ ${response.data?.message || "No existing booking rule found. Please try again later."}`, "error");
        return;
      }

      if (allowOvernightStay) {
        // IMPORTANT: getActiveBookingRuleForDateCount() (used by
        // /api/booking-rules) falls back to "whichever Active Overnight
        // rule was most recently updated" whenever no rule exists for
        // this EXACT howManySelectedDates — so rule.allowOvernightStay
        // being true does NOT by itself mean this rule was built for
        // nightsSelected. It could silently be a 1-night rule matched
        // against a 3-night selection. matchedRuleNights
        // (BookingRule.howManySelectedDates) must equal nightsSelected
        // for this to be a genuine, admin-configured match.
        const overnightFits = rule.allowOvernightStay && rule.matchedRuleNights === nightsSelected;

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
          // Tour types too — using overnightBlocksTourSet here (not
          // overnightSet) because that also includes the CHECKOUT day
          // of an overnight stay: checkout time overlaps Day Tour's
          // start, so that day must hide Day/Night Tour too even though
          // it stays open on the calendar for a new Overnight check-in
          // (see the matching gte fix in services/bookingPricing.js's
          // exclusivity check). Day Tour and Night Tour don't block each
          // other — a date already carrying one of those still allows
          // the other. (The Overnight-booking case below is normally
          // unreachable since such a date is already unclickable on the
          // calendar — kept anyway as defense-in-depth.)
          // Only Day Tour overlaps an overnight checkout's morning start —
          // Night Tour runs in the evening, long after any reasonable
          // checkout time, so overnightBlocksDayTourSet must never gate
          // it (matches the backend rule in app/api/bookings/dates/route.js
          // and services/bookingPricing.js's gte-for-day_tour-only check).
          const dateBlocksDayTour = overnightBlocksDayTourSet.has(checkInKey);
          const dateHasAnyExistingBooking = anyBookedSet.has(checkInKey);
          // A Day Tour or Night Tour that's already booked on this exact
          // date can't be booked again (one slot per type per day) —
          // without this, a date already carrying both an existing Day
          // Tour AND Night Tour booking would still offer both options
          // again in TourSelectionModal, letting a visitor double-book
          // a slot that's already taken.
          const dateDayTourTaken = dayTourSet.has(checkInKey);
          const dateNightTourTaken = nightTourSet.has(checkInKey);
          const conflictAdjustedOvernightFits = overnightFits && !dateHasAnyExistingBooking;
          const conflictAdjustedAllowDayTour = timeAllowsDayTour && !dateBlocksDayTour && !dateDayTourTaken;
          const conflictAdjustedAllowNightTour = timeAllowsNightTour && !dateNightTourTaken;
          // Pure checkout-day case — the date itself isn't otherwise
          // booked (still open on the calendar for a new Overnight
          // check-in), but it does carry a same-day checkout that just
          // narrowed the Tour options above. Surfaced to the visitor as
          // an awareness notice in TourSelectionModal rather than
          // letting them find out only after picking Day Tour.
          const checkoutNotice =
            !dateHasAnyExistingBooking && overnightCheckoutSet.has(checkInKey) && checkOutTime
              ? `The previous guests check out at ${formatTime12Hour(checkOutTime)} this day, so Day Tour may not be available.`
              : null;

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
            checkoutNotice,
            // Each option's own check-in/out (or start/end) time —
            // TourSelectionModal reads these by key (checkInTime/
            // checkOutTime, dayTourStartTime/dayTourEndTime,
            // nightTourStartTime/nightTourEndTime) to show a time range
            // on each card.
            timeWindows: {
              checkInTime: rule.checkInTime,
              checkOutTime: rule.checkOutTime,
              dayTourStartTime: rule.dayTourStartTime,
              dayTourEndTime: rule.dayTourEndTime,
              nightTourStartTime: rule.nightTourStartTime,
              nightTourEndTime: rule.nightTourEndTime,
            },
            // Promo entries active on THIS specific date (if any) — lets
            // TourSelectionModal badge whichever option(s) the promo's
            // appliesTo scope actually covers.
            promoEntries: promoMap.get(checkInKey) ?? [],
          });
          return;
        }

        // 2+ dates selected — no ambiguity, this can only ever be an
        // Overnight stay, so a rule set actually built for this exact
        // night count must exist and be Active — never silently reuse
        // a fallback rule built for a different night count.
        if (!rule.allowOvernightStay) {
          showToast("✕ Overnight stays aren't available right now. Please try again later.", "error");
          return;
        }
        if (!overnightFits) {
          showToast(`✕ No existing booking rule for a ${nightsSelected}-night stay. Please choose a different date range or try again later.`, "error");
          return;
        }

        // Rule confirmed for these dates — open the room-selection
        // modal instead of routing straight to the reservation page.
        // The visitor picks a room there; handleRoomSelected() below
        // does the actual navigation once they do (singleDateFlow is
        // false here, so it routes straight through as Overnight).
        setRoomModalRequest({
          checkInDate: checkInKey,
          checkOutDate: checkOutKey,
          ruleId: rule.matchedRuleId,
          singleDateFlow: false,
          allowOvernightStay: true,
          allowDayTour: false,
          allowNightTour: false,
        });
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
    } catch (error) {
      // Surfaces the REAL failure instead of a one-size-fits-all message
      // — this used to always show "No existing booking rule found"
      // regardless of cause, making it impossible to tell a genuine
      // "no rule configured" case apart from a network/server error.
      // A 404 here is the EXPECTED Golden Rule guardrail response (see
      // app/api/booking-rules/route.js) — not a bug — so it's skipped
      // from console.error to avoid tripping Next.js's dev-mode error
      // overlay for normal, working behavior. Anything else (500,
      // network failure, etc.) still logs so DevTools/terminal shows
      // the actual stack trace for real debugging.
      if (error?.response?.status !== 404) {
        console.error("[HowToBookSection] handleContinue failed:", error);
      }
      const serverMessage = error?.response?.data?.message;
      showToast(`✕ ${serverMessage || "Something went wrong finding your booking rule. Please try again."}`, "error");
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
        checkoutNotice: roomModalRequest.checkoutNotice,
        timeWindows: roomModalRequest.timeWindows,
        promoEntries: roomModalRequest.promoEntries,
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

    const params = new URLSearchParams({ checkin: checkInDate, type, roomId: room.id });
    setTourSelectionRequest(null);
    router.push(`/visitor/booking?${params.toString()}`);
  }

  /**
   * handleTourSelectionBack
   * Fired when the visitor taps "Back" inside TourSelectionModal
   * (Step 3) — re-opens RoomSelectionModal (Step 2) with the exact
   * same dates/rule/allow-flags/notices that were already resolved
   * the first time through, so the visitor can pick a different room
   * without losing their selected date and without a full network
   * refetch. singleDateFlow: true is restored so handleRoomSelected
   * routes back into TourSelectionModal again afterward, same as the
   * original forward path.
   */
  function handleTourSelectionBack() {
    if (!tourSelectionRequest) return;
    setRoomModalRequest({
      checkInDate: tourSelectionRequest.checkInDate,
      checkOutDate: tourSelectionRequest.checkOutDate,
      ruleId: tourSelectionRequest.ruleId,
      singleDateFlow: true,
      allowOvernightStay: tourSelectionRequest.allowOvernightStay,
      allowDayTour: tourSelectionRequest.allowDayTour,
      allowNightTour: tourSelectionRequest.allowNightTour,
      dayTourPricePerGuest: tourSelectionRequest.dayTourPricePerGuest,
      nightTourPricePerGuest: tourSelectionRequest.nightTourPricePerGuest,
      checkoutNotice: tourSelectionRequest.checkoutNotice,
      timeWindows: tourSelectionRequest.timeWindows,
      promoEntries: tourSelectionRequest.promoEntries,
    });
    setTourSelectionRequest(null);
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
                // Admin-set blackout ("resort under maintenance") — computed
                // up front (moved above isOpen) so a maintenance day is
                // never treated as tappable. Matches BookedDatesSection's
                // read-only mini calendar, where maintenance days render as
                // a plain non-interactive <span> — here the cell is a
                // <button>, so it must be explicitly excluded from isOpen
                // (disabled={!isOpen} below) instead of just styled amber.
                const isMaintenanceDay = maintenanceSet.has(cellKey);
                const isOpen = !isBooked && !isPast && !isMaintenanceDay;
                const isSelected = selectedSet.has(cellKey);
                // Open day that's still the checkout day of an existing
                // overnight stay — stays clickable (a new Overnight
                // guest can check in this day), but Day Tour won't be
                // an option here, so flag it visually up front instead
                // of only after the visitor picks Day Tour and hits an
                // error. See overnightCheckoutSet in useBookedDates.
                const isCheckoutDay = isOpen && overnightCheckoutSet.has(cellKey);
                // Open day that already has a Day Tour and/or Night Tour
                // booking — still clickable (another Tour can still be
                // booked, and multiple tours coexist per day up to
                // capacity), but a NEW Overnight stay can't start here
                // (see conflictAdjustedOvernightFits in handleContinue()
                // above). Flagged visually up front, same reasoning as
                // isCheckoutDay above, instead of only surfacing after
                // the visitor picks Overnight and hits a rejection.
                // Both Day Tour AND Night Tour are already booked on this
                // date — no Tour capacity left at all (and Overnight is
                // already blocked too, since either Tour type alone blocks
                // a new Overnight). Kept visually and behaviorally distinct
                // from howToBookCalendarDayBooked (Overnight — fully red,
                // unclickable): this day stays open/clickable in case the
                // active rule still allows something else in the future,
                // but is flagged with its own "day full" badge instead of
                // reusing the single-tour-booked dot, so a visitor isn't
                // misled into thinking a slot is still free.
                const isFullyTourBookedDay = isOpen && dayTourSet.has(cellKey) && nightTourSet.has(cellKey);
                const isTourBookedDay = isOpen && !isFullyTourBookedDay && (dayTourSet.has(cellKey) || nightTourSet.has(cellKey));
                // Promo Dates (Section 5b) — flagged on any open day that
                // has an active discount, so a visitor spots it before
                // tapping Continue instead of only finding out once
                // pricing is computed on the booking form. A date can
                // carry more than one promo entry (different tour-type
                // scopes) — the dot just shows the highest % among them,
                // TourSelectionModal's per-option badges (below) show the
                // full per-type breakdown once a type-ambiguous single
                // date is actually being booked.
                const promoEntriesForDay = isOpen ? promoMap.get(cellKey) : undefined;
                const isPromoDay = Boolean(promoEntriesForDay?.length);
                const promoDiscount = isPromoDay
                  ? Math.max(...promoEntriesForDay.map((entry) => entry.discountPercent))
                  : undefined;

                // Red-circle-fill status (replaces the old tiny corner
                // dots): a day is either fully red (completely booked —
                // either truly unclickable Overnight via isBooked, or
                // open-but-maxed via isFullyTourBookedDay) or half red
                // (partially affected — a single Tour already booked,
                // OR it's the checkout morning of a previous overnight
                // stay). Fully takes priority over half on the rare date
                // that could technically match both.
                const isFullyRedDay = isFullyTourBookedDay;
                const isHalfRedDay = !isFullyRedDay && (isCheckoutDay || isTourBookedDay);
                let cls = "howToBookCalendarDay";
                if (isBooked) cls += " howToBookCalendarDayBooked";
                if (isPast && !isBooked) cls += " howToBookCalendarDayPast";
                if (isToday) cls += " howToBookCalendarDayToday";
                if (isOpen) cls += " howToBookCalendarDayOpen";
                if (isFullyRedDay) cls += " howToBookCalendarDayFullyBooked";
                if (isHalfRedDay) cls += " howToBookCalendarDayPartiallyBooked";
                if (isSelected) cls += " howToBookCalendarDaySelected";
                if (isPromoDay) cls += " howToBookCalendarDayPromo";
                if (isMaintenanceDay) cls += " howToBookCalendarDayMaintenance";

                return (
                  <button
                    key={cellKey}
                    type="button"
                    className={cls}
                    disabled={!isOpen}
                    aria-pressed={isOpen ? isSelected : undefined}
                    aria-label={
                      isMaintenanceDay
                        ? `${cellKey} — resort is undergoing maintenance`
                        : isOpen
                        ? `${isSelected ? "Deselect" : "Select"} ${cellKey}${
                            isCheckoutDay && checkOutTime ? ` — previous guests check out ${formatTime12Hour(checkOutTime)}` : ""
                          }${isFullyTourBookedDay ? " — Day Tour and Night Tour are both already booked this day" : isTourBookedDay ? " — a Tour is already booked this day" : ""}${
                            isPromoDay ? ` — ${promoDiscount}% OFF promo` : ""
                          }`
                        : undefined
                    }
                    onClick={() => handleDayClick(cellKey, isPast, isBooked)}
                    title={
                      isMaintenanceDay
                        ? "Resort is undergoing maintenance."
                        : isPromoDay
                        ? `${promoDiscount}% OFF promo`
                        : isCheckoutDay && checkOutTime
                        ? `Checkout ${formatTime12Hour(checkOutTime)}`
                        : isFullyTourBookedDay
                        ? "Day Tour and Night Tour are both already booked this day"
                        : isTourBookedDay
                        ? "A Tour is already booked this day"
                        : undefined
                    }
                  >
                    {isMaintenanceDay ? (
                      <span className="howToBookCalendarDayMaintenanceContent">
                        <span className="howToBookCalendarDayMaintenanceNumber">{day}</span>
                        <span className="howToBookCalendarDayMaintenanceIcon" aria-hidden="true">!</span>
                      </span>
                    ) : isPromoDay ? (
                      <span className="howToBookCalendarDayPromoContent">
                        <span className="howToBookCalendarDayPromoNumber">{day}</span>
                        <span className="howToBookCalendarDayPromoDiscount" aria-hidden="true">
                          -{promoDiscount}%
                        </span>
                      </span>
                    ) : (
                      day
                    )}
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
                <span className="howToBookCalendarLegendDot howToBookCalendarLegendDotHalfRed" />
                Partially booked
              </span>
              <span className="howToBookCalendarLegendItem">
                <span className="howToBookCalendarLegendDot howToBookCalendarLegendDotFullRed" />
                Fully booked
              </span>
              <span className="howToBookCalendarLegendItem">
                <span className="howToBookCalendarLegendDot howToBookCalendarLegendDotMaintenance" />
                Under Maintenance
              </span>
              <span className="howToBookCalendarLegendItem">
                <span className="howToBookCalendarLegendDot howToBookCalendarLegendDotToday" />
                Today
              </span>
              <span className="howToBookCalendarLegendItem">
                <span className="howToBookCalendarLegendDot howToBookCalendarLegendDotPromo" />
                Promo discount available
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
        allowOvernightStay={roomModalRequest?.allowOvernightStay ?? true}
        allowDayTour={roomModalRequest?.allowDayTour ?? false}
        allowNightTour={roomModalRequest?.allowNightTour ?? false}
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
        checkoutNotice={tourSelectionRequest?.checkoutNotice}
        timeWindows={tourSelectionRequest?.timeWindows}
        promoEntries={tourSelectionRequest?.promoEntries}
        onBack={handleTourSelectionBack}
        onSelectType={handleTourTypeSelected}
        onClose={() => setTourSelectionRequest(null)}
      />
    </section>
  );
}