/**
 * FILE: services/bookingPricing.js
 * PURPOSE:
 * Shared server-side quote calculation + rule validation for the
 * visitor booking flow. Used by BOTH app/api/bookings/quote/route.js
 * (preview, no DB write) and app/api/bookings/route.js (final create) —
 * kept in one place so the price a guest previews is always computed
 * the exact same way as the price actually saved. Never import this
 * into a "use client" file — it's server-only (Prisma, Decimal math).
 *
 * ASSUMPTIONS (business rules not explicit in the BookingRules schema,
 * documented here so a future admin/dev knows why):
 *   - "Last-minute" (lastMinuteDiscountPercent) = check-in is within the
 *     next 3 days of today.
 *   - "Group" (groupDiscountThreshold/groupDiscountPercent) = the party's
 *     numberOfGuests meets or exceeds the threshold (this template has
 *     no multi-room cart, so "group" is read as "large party size").
 */
import { prisma } from "@/services/prisma";
import { getActiveBookingRule, getActiveBookingRuleForDateCount } from "@/services/bookingRules";
import { getCleaningEndsAt } from "@/services/cleaningBuffer";
import { getGlobalCleaningHours } from "@/services/cleaningHours";

const LAST_MINUTE_WINDOW_DAYS = 3;

/** Local YYYY-MM-DD key — matches the format every other date util in this app uses */
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * toUtcMidnight
 * Converts a local-midnight calendar-day Date (what startOfDay() above
 * produces) into a UTC-midnight Date for that SAME calendar day.
 *
 * BUG THIS FIXES: Booking.checkInDate/checkOutDate are @db.Date columns
 * — Prisma always round-trips these as UTC midnight of the stored
 * calendar day, regardless of server timezone. But checkIn/checkOut in
 * this file are built via startOfDay(), which zeroes in LOCAL time. On
 * a server running UTC+8 (this resort's timezone), a Day Tour checkIn
 * of "2026-07-31" becomes local midnight = 2026-07-30T16:00:00Z, which
 * Prisma then truncates down to DATE '2026-07-30' when comparing — one
 * day EARLIER than intended. That made a July 31 Day Tour request
 * falsely match an existing booking that checked out July 30, throwing
 * "already booked for an overnight stay" for a date with no real
 * conflict at all.
 * Use this wrapper on checkIn/checkOut ONLY where they're compared
 * against a Prisma checkInDate/checkOutDate field. Local-time-based
 * comparisons elsewhere in this file (Same-Day Policy, nights math,
 * daysBetween) are unaffected and must keep using the original
 * local-midnight checkIn/checkOut — they're comparing against real
 * wall-clock time, not a stored DATE column.
 */
function toUtcMidnight(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/**
 * utcDateToLocalCalendarDay
 * The inverse direction of toUtcMidnight() above: takes a raw Prisma
 * @db.Date value (always UTC midnight for its stored calendar day,
 * regardless of server timezone) and returns a LOCAL-midnight Date for
 * that same calendar day. Needed anywhere this file does real wall-
 * clock math (combineDateAndTime, direct Date comparisons) against a
 * value that came straight from a checkInDate/checkOutDate column —
 * calling date.getFullYear()/getMonth()/getDate() (local methods)
 * directly on the raw UTC-midnight value is exactly the "one day off"
 * bug toUtcMidnight() above was written to fix, just in the opposite
 * direction.
 */
function utcDateToLocalCalendarDay(utcDate) {
  return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

/**
 * combineDateAndTime
 * Builds a real Date/moment from a calendar date + a rule's "HH:mm"
 * time string (checkInTime, dayTourStartTime, etc). Used only for the
 * Same-Day Check-In Policy comparison below — never mutates the input
 * date.
 */
function combineDateAndTime(date, hhmm) {
  const [hour, minute] = String(hhmm).split(":").map(Number);
  const moment = new Date(date);
  moment.setHours(hour || 0, minute || 0, 0, 0);
  return moment;
}

/**
 * findSeasonalRate
 * Returns the overriding per-night rate for `date` from `seasonalPrices`
 * if one of the room's seasonal ranges covers it, otherwise null.
 */
function findSeasonalRate(date, seasonalPrices) {
  const key = toDateKey(date);
  const match = seasonalPrices.find((season) => {
    return toDateKey(season.startDate) <= key && key <= toDateKey(season.endDate);
  });
  return match ? Number(match.pricePerNight) : null;
}

/**
 * validateAndQuoteBooking
 * Runs every BookingRules-driven check (nights, advance window, tour
 * toggles, party size, room availability/blackouts) and — only if every
 * check passes — returns a price breakdown. Throws a plain Error with a
 * human-readable `.message` on the first failed check, which route
 * handlers turn straight into a 400 JSON response.
 *
 * @param {object} input
 * @param {string|null} input.roomId — required for every booking type
 *   now (Overnight, Day Tour, Night Tour) since Day/Night Tour pricing
 *   comes from the room's own dayTourPrice/nightTourPrice
 * @param {string} input.bookingType   "overnight" | "day_tour" | "night_tour"
 * @param {string} input.checkInDate  "YYYY-MM-DD"
 * @param {string|null} input.checkOutDate "YYYY-MM-DD" (overnight only)
 * @param {number} input.numberOfGuests
 * @param {string|null} input.excludeBookingId — ignore this booking's own
 *   dates when checking overlap (not used yet, reserved for a future
 *   "edit my booking" flow)
 * @param {object} [input.client] — Prisma client to use for every DB read
 *   in this function (room lookup, overlap check, blackout check, seasonal
 *   pricing). Defaults to the shared `prisma` singleton for the quote
 *   preview route. app/api/bookings/route.js passes its transaction's
 *   `tx` client here instead, so the overlap re-check and the eventual
 *   booking.create() happen inside the SAME Serializable transaction —
 *   required for the race-condition fix (deep search Section 2) to work;
 *   passing the global `prisma` there would defeat the whole point.
 */
export async function validateAndQuoteBooking({
  roomId,
  bookingType,
  checkInDate,
  checkOutDate,
  numberOfGuests,
  client = prisma,
}) {
  // For an Overnight stay, work out the nights BEFORE resolving the rule
  // set — this is what lets us match a specific rule set built for this
  // exact night count (e.g. "4Ds-3Ns"), rather than always falling back
  // to whichever Active rule happens to be most recently updated. A
  // malformed/missing checkOutDate just leaves nightsForRuleMatch null,
  // which getActiveBookingRuleForDateCount treats the same as "no rule
  // matched" — the checks below (missing checkOutDate, nights < 1,
  // outside min/max) still fire with their normal messages either way.
  let nightsForRuleMatch = null;
  if (bookingType === "overnight" && checkOutDate) {
    const provisionalCheckIn = startOfDay(new Date(`${checkInDate}T00:00:00`));
    const provisionalCheckOut = startOfDay(new Date(`${checkOutDate}T00:00:00`));
    if (!Number.isNaN(provisionalCheckIn.getTime()) && !Number.isNaN(provisionalCheckOut.getTime())) {
      nightsForRuleMatch = daysBetween(provisionalCheckIn, provisionalCheckOut);
    }
  }

  // Resolve the rule set active for THIS booking type specifically —
  // Overnight, Day Tour, and Night Tour each have their own independent
  // active rule set (see services/bookingRules.js). This is the actual
  // fix for "set na si Day Tour, tapos gustong mag-Night Tour ng
  // visitor pero walang active rule doon" — each type now always
  // resolves its own rule regardless of which other types are active.
  // For Overnight, this now also tries to match a rule set built for
  // this exact number of nights (e.g. picking a 3-night stay resolves
  // "3Ds-2Ns" over "4Ds-3Ns" when both are Active) before falling back
  // to the old "most recently updated Active rule" behavior.
  const rules = await getActiveBookingRuleForDateCount(bookingType, nightsForRuleMatch);

  // --- Booking type must be enabled by the admin ---
  if (bookingType === "overnight" && !rules.allowOvernightStay) {
    throw new Error("Overnight stays are not currently available. Please choose a Day Tour or Night Tour.");
  }
  if (bookingType === "day_tour" && !rules.allowDayTour) {
    throw new Error("Day Tour bookings are not currently available.");
  }
  if (bookingType === "night_tour" && !rules.allowNightTour) {
    throw new Error("Night Tour bookings are not currently available.");
  }
  if (!["overnight", "day_tour", "night_tour"].includes(bookingType)) {
    throw new Error("Please select a valid booking type.");
  }

  const today = startOfDay(new Date());
  const checkIn = startOfDay(new Date(`${checkInDate}T00:00:00`));

  if (Number.isNaN(checkIn.getTime()) || checkIn < today) {
    throw new Error("Check-in date must be today or later.");
  }

  // Still needed below for the Last-Minute Discount window check
  // (rules.lastMinuteDiscountPercent) — advanceBookingDays itself no
  // longer gates anything, but daysOut is unrelated to that field.
  const daysOut = daysBetween(today, checkIn);

  if (!Number.isInteger(numberOfGuests) || numberOfGuests < 1) {
    throw new Error("Enter a valid number of guests.");
  }

  // --- Allowed Pax — hard capacity cap for this rule set (Section 1,
  //     Booking Rules form). Re-checked here regardless of what the
  //     visitor form already enforced client-side, since this is the
  //     only place a Booking row actually gets written from (see
  //     app/api/bookings/route.js file header). ---
  if (numberOfGuests > rules.maxPax) {
    throw new Error(`This package allows a maximum of ${rules.maxPax} pax.`);
  }

  // --- Room lookup — every booking type now requires one. Overnight
  // needs it for the room itself; Day Tour / Night Tour need it because
  // their price is now the ROOM's own flat dayTourPrice/nightTourPrice
  // (see prisma/schema.prisma), not a resort-wide per-guest rate. ---
  if (!roomId) {
    throw new Error(
      bookingType === "overnight" ? "Please select a room for an overnight stay." : "Please select a room for this tour."
    );
  }
  const room = await client.room.findUnique({ where: { id: roomId } });
  if (!room || !room.isActive) {
    throw new Error("The selected room is no longer available.");
  }
  if (numberOfGuests > room.capacity) {
    throw new Error(`This room fits up to ${room.capacity} guest(s).`);
  }

  // --- Overnight-only: nights count, room availability ---
  let checkOut = checkIn;
  let nights = 0;

  if (bookingType === "overnight") {
    if (!checkOutDate) throw new Error("Please select a check-out date.");

    checkOut = startOfDay(new Date(`${checkOutDate}T00:00:00`));
    nights = daysBetween(checkIn, checkOut);

    if (nights < 1) {
      throw new Error("Check-out date must be after check-in date.");
    }
  }

  // --- Same-Day Check-In Policy (BookingRule.sameDayPolicy) ---
  // Only relevant when the requested check-in date is TODAY and the
  // clock has already passed this rule's normal start time for the
  // chosen booking type — a future-dated booking is never affected no
  // matter what time it is right now. Each type is checked against its
  // own start/end time pair (overnight uses checkInTime/checkOutTime;
  // Day/Night Tour use their own tour start/end times).
  let effectiveCheckInAt = null;
  let effectiveCheckOutAt = null;

  if (checkIn.getTime() === today.getTime()) {
    const startTimeByType = {
      overnight: rules.checkInTime,
      day_tour: rules.dayTourStartTime,
      night_tour: rules.nightTourStartTime,
    };
    const endTimeByType = {
      overnight: rules.checkOutTime,
      day_tour: rules.dayTourEndTime,
      night_tour: rules.nightTourEndTime,
    };
    const ruleStartMoment = combineDateAndTime(checkIn, startTimeByType[bookingType]);
    const now = new Date();

    if (now > ruleStartMoment) {
      if (rules.sameDayPolicy === "auto_adjust") {
        // Shift the effective check-in to right now, and push the
        // checkout moment forward by the exact same delay so the
        // guest's paid duration never shrinks just because they're
        // arriving later than the rule's normal start time.
        const originalCheckOutMoment = combineDateAndTime(checkOut, endTimeByType[bookingType]);
        const delayMs = now.getTime() - ruleStartMoment.getTime();

        effectiveCheckInAt = now;
        effectiveCheckOutAt = new Date(originalCheckOutMoment.getTime() + delayMs);

        // If the shifted checkout moment lands on a different calendar
        // day than the rule's original checkout day, the booking's
        // checkOutDate itself must move forward to match — this is the
        // "and the date too" part of the auto-adjust behavior.
        if (toDateKey(effectiveCheckOutAt) !== toDateKey(originalCheckOutMoment)) {
          checkOut = startOfDay(effectiveCheckOutAt);
        }
      } else {
        // "strict" (default) — the rule's start time for today has
        // already passed; refuse the booking outright rather than
        // silently reinterpreting the rule everyone else books under.
        throw new Error(
          `Check-in time for today (${startTimeByType[bookingType]}) has already passed. Please choose a different date or contact us directly.`
        );
      }
    }
  }

  // --- Shared fetch: every confirmed booking, any type ---
  // Uses `client` (not the global `prisma`) so this read happens inside the
  // same transaction as the eventual booking.create() in
  // app/api/bookings/route.js — the Serializable isolation level then makes
  // Postgres itself detect if a concurrent request already booked these
  // dates between this read and that write. Fetched once, ahead of both the
  // overnight-only exclusivity check below and the resort-wide cleaning-
  // buffer check further down — Villa Azure is one exclusive private villa,
  // so both checks look at every confirmed booking regardless of type.
  const existingBookings = await client.booking.findMany({
    // "pending" holds the same as "confirmed" (DP Countdown soft-hold —
    // see Booking.pendingExpiresAt) so a second guest can't slip into a
    // room another guest is already awaiting owner confirmation for.
    // But a "pending" row past its own pendingExpiresAt is stale — only
    // still "pending" because the cron sweep (app/api/cron/
    // booking-expiry/route.js) hasn't run yet — so it's excluded here
    // too, same reasoning as app/api/bookings/dates/route.js. EXCEPTION:
    // a short-window (capped) hold past its scheduled start is NEVER
    // auto-expired by that cron sweep (super-admin decides manually —
    // see Booking.pendingHoldCapped) so it must still count as active
    // here even though its pendingExpiresAt has already passed.
    where: {
      OR: [
        { status: "confirmed" },
        { status: "pending", OR: [{ pendingExpiresAt: { gt: new Date() } }, { pendingHoldCapped: true }] },
      ],
    },
    select: {
      checkInDate: true,
      checkOutDate: true,
      bookingType: true,
      effectiveCheckOutAt: true,
      cleaningHoursSnapshot: true,
    },
  });

  // Cleaning Hours is now ONE resort-wide value (SystemSettings, see
  // services/cleaningHours.js) — no longer per rule set. Fetched once
  // here (function scope) so both the turnover-conflict check below and
  // the final returned quote (cleaningHours, snapshotted onto the
  // Booking row) use the exact same value.
  const globalCleaningHours = await getGlobalCleaningHours();

  // Day Tour / Night Tour bookings occupy exactly one date
  // (checkInDate === checkOutDate) — treat that single date as
  // occupying [date, date+1) for the same half-open range comparison
  // used for Overnight-vs-Overnight overlap below.
  const requestedCheckInUtc = toUtcMidnight(checkIn);
  const requestedCheckOutUtc = toUtcMidnight(checkOut);

  // --- Type-exclusivity check against existing confirmed bookings (Overnight only) ---
  // Exclusivity rule (villa is booked for exclusive use per stay):
  //   - Overnight conflicts with ANY existing confirmed booking (Overnight,
  //     Day Tour, or Night Tour) that falls within its date range — the
  //     villa is committed to another visit, regardless of type or room.
  //   - Day Tour and Night Tour do NOT conflict with each other — a
  //     daytime visit and a separate evening visit the same date don't
  //     overlap in time, so both can be confirmed for the same date.
  //   - Day Tour and Night Tour DO conflict with an existing Overnight
  //     booking on that date — the villa is already exclusively occupied.
  if (bookingType === "overnight" && roomId) {
    const requestedOverlaps = existingBookings.some((existing) => {
      const existingCheckOut =
        existing.bookingType === "overnight"
          ? existing.checkOutDate
          : new Date(existing.checkInDate.getTime() + 86400000);
      return requestedCheckInUtc < existingCheckOut && requestedCheckOutUtc > existing.checkInDate;
    });
    if (requestedOverlaps) {
      throw new Error("Those dates were just booked. Please pick a different date.");
    }

    const blackoutRanges = await client.blackoutDate.findMany({
      where: { roomId },
      select: { startDate: true, endDate: true, reason: true },
    });
    const hitsBlackout = blackoutRanges.some(
      (blackout) => requestedCheckInUtc < blackout.endDate && requestedCheckOutUtc > blackout.startDate
    );
    if (hitsBlackout) {
      throw new Error("This room is closed for part of your selected date range. Please pick a different date.");
    }
  }

  // --- Cleaning-buffer conflict check (ALL booking types, both directions) ---
  // Applies resort-wide, regardless of the incoming request's type: the
  // date-range/exclusivity checks above deliberately ALLOW a same-day
  // turnover (an existing booking's checkout date === this request's
  // check-in date) — that's the normal, expected case for back-to-back
  // bookings. But if that specific existing booking's actual checkout
  // moment + the resort-wide Cleaning Hours setting (SystemSettings, see
  // services/cleaningHours.js — ONE value shared by every booking type
  // and rule set) runs past the requested check-in moment on that same
  // calendar day, the incoming guest would arrive before the villa is
  // actually ready — regardless of whether the outgoing booking was
  // Overnight, Day Tour, or Night Tour, and regardless of what type is
  // checking in next. This applies resort-wide, in both directions.
  {
    const startTimeByType = {
      overnight: rules.checkInTime,
      day_tour: rules.dayTourStartTime,
      night_tour: rules.nightTourStartTime,
    };
    const requestedCheckInMoment = effectiveCheckInAt ?? combineDateAndTime(checkIn, startTimeByType[bookingType]);

    // Resolve the currently active rule for every OTHER booking type too
    // (reusing `rules` for the incoming type itself, no extra fetch) — an
    // outgoing booking that started this whole turnover could be any of
    // the 3 types, and each type's checkout time lives on its own rule.
    const [overnightRule, dayTourRule, nightTourRule] = await Promise.all([
      bookingType === "overnight" ? rules : getActiveBookingRule("overnight"),
      bookingType === "day_tour" ? rules : getActiveBookingRule("day_tour"),
      bookingType === "night_tour" ? rules : getActiveBookingRule("night_tour"),
    ]);
    const ruleByType = { overnight: overnightRule, day_tour: dayTourRule, night_tour: nightTourRule };

    const turnoverConflict = existingBookings.some((existing) => {
      // Only current/upcoming bookings can ever conflict with a brand-new
      // one — a booking whose checkout date has already fully passed is
      // done and gone regardless of what Cleaning Hours is set to today.
      // (checkIn itself is already required to be today or later above,
      // but this guard makes that intent explicit here too, so this check
      // can never reach back into old history even if that earlier rule
      // changes later.)
      const existingCheckOutLocalDay = utcDateToLocalCalendarDay(existing.checkOutDate);
      if (existingCheckOutLocalDay < today) return false;

      const isBackToBackTurnover = toDateKey(existingCheckOutLocalDay) === toDateKey(checkIn);
      if (!isBackToBackTurnover) return false;

      const ruleForExisting = ruleByType[existing.bookingType] ?? ruleByType.overnight;
      const endTimeByType = {
        overnight: ruleForExisting.checkOutTime,
        day_tour: ruleForExisting.dayTourEndTime,
        night_tour: ruleForExisting.nightTourEndTime,
      };

      // Prefer the exact recorded moment (set only when that earlier
      // booking's own Same-Day Auto-Adjust actually fired); otherwise
      // fall back to that booking's own type's standard end time for
      // that day.
      const existingCheckoutMoment =
        existing.effectiveCheckOutAt ??
        combineDateAndTime(existingCheckOutLocalDay, endTimeByType[existing.bookingType]);

      // Prefer the Cleaning Hours snapshotted on THAT booking at the
      // moment it was created — never today's live global setting — so
      // an owner changing Cleaning Hours afterward can't retroactively
      // change what an already-made booking is checked against. Only
      // bookings created before this column existed fall back to the
      // current resort-wide value.
      const cleaningHoursForExisting = existing.cleaningHoursSnapshot ?? globalCleaningHours;
      const cleaningEndsAt = getCleaningEndsAt(existingCheckoutMoment, cleaningHoursForExisting);

      return requestedCheckInMoment < cleaningEndsAt;
    });
    if (turnoverConflict) {
      throw new Error(
        "This isn't ready yet for that check-in time — the previous guest's checkout and cleaning haven't finished. Please choose a later check-in time or a different date."
      );
    }
  }

  // Day Tour / Night Tour: no room-based overlap check needed (tours
  // don't lock a specific room the way an Overnight stay does), but an
  // existing Overnight booking on this date DOES conflict — the villa
  // is already exclusively occupied that day. Day Tour and Night Tour
  // never conflict with each other (see exclusivity rule above), so
  // this only ever checks against confirmed Overnight bookings.
  if (bookingType === "day_tour" || bookingType === "night_tour") {
    // gte for Day Tour ONLY, not Night Tour: the overnight guest's
    // checkout DAY still blocks Day Tour — checkout is at checkOutTime
    // (e.g. 11:00), which overlaps Day Tour's morning start (e.g.
    // 08:00). Night Tour starts in the evening (e.g. 18:00), long after
    // any reasonable checkout time, so it has no real overlap and must
    // stay bookable on the checkout day — using gte for it too was the
    // bug: it hid Night Tour on a date where nothing actually conflicts
    // with it.
    const checkoutDateOperator = bookingType === "day_tour" ? "gte" : "gt";
    // Must use the UTC-anchored checkIn (see toUtcMidnight() above) —
    // this is the query that produced the reported false positive:
    // comparing local-midnight checkIn directly against the @db.Date
    // checkOutDate column shifted a July 31 request back to July 30 on
    // a UTC+8 server, wrongly matching a booking that checked out
    // July 30 and throwing "already booked for an overnight stay" for
    // a date with no real conflict.
    const conflictingOvernightStay = await client.booking.findFirst({
      where: {
        // Same stale-pending exclusion as the shared fetch above — a
        // "pending" row past its own pendingExpiresAt must not count
        // here either, or a guest can get wrongly blocked by a hold
        // the cron just hasn't swept yet. Same pendingHoldCapped
        // exception as above — a breached short-window hold is still
        // active until a super-admin acts on it.
        OR: [
          { status: "confirmed" },
          { status: "pending", OR: [{ pendingExpiresAt: { gt: new Date() } }, { pendingHoldCapped: true }] },
        ],
        bookingType: "overnight",
        checkInDate: { lte: toUtcMidnight(checkIn) },
        checkOutDate: { [checkoutDateOperator]: toUtcMidnight(checkIn) },
      },
      select: { id: true },
    });
    if (conflictingOvernightStay) {
      throw new Error("The villa is already booked for an overnight stay on this date. Please pick a different date.");
    }
  }

  // --- Pricing ---
  let subtotal = 0;

  // --- Promo Date discount lookup (Section 5b, Booking Rules list page —
  // see PromoDatesSection.jsx) ---
  // PromoDate rows are per-CALENDAR-DAY, not a date range, and each may
  // be scoped to "all" or a specific bookingType. Fetched once here as a
  // date-key -> best-discount map so the pricing loop below can look up
  // each individual date in O(1). Range covers every date this booking
  // actually occupies: every night for Overnight, or just the single
  // requested date for Day/Night Tour.
  // If a date matches BOTH a resort-wide "all" row and a type-specific
  // row, the higher discount wins — never let two stacked promos
  // resolve to less than the single best offer a guest could see.
  //
  // bookingRuleId scope (see PromoDate.bookingRuleId in schema.prisma):
  // a promo with bookingRuleId left null applies no matter which rule
  // set is active; a promo scoped to a specific rule set only applies
  // when THAT rule set is the one `rules` above actually resolved to
  // for this booking type — so an owner can tie a discount to e.g.
  // "Holiday Season Rules" only, and it silently stops applying the
  // moment a different rule set takes over that date.
  const promoRangeStart = toUtcMidnight(checkIn);
  const promoRangeEnd =
    bookingType === "overnight"
      ? toUtcMidnight(checkOut)
      : new Date(toUtcMidnight(checkIn).getTime() + 86400000);
  const activePromoDates = await client.promoDate.findMany({
    where: {
      isActive: true,
      appliesTo: { in: ["all", bookingType] },
      date: { gte: promoRangeStart, lt: promoRangeEnd },
      OR: [{ bookingRuleId: null }, { bookingRuleId: rules.id }],
    },
    select: { date: true, discountPercent: true },
  });
  const promoDiscountByDateKey = new Map();
  for (const promo of activePromoDates) {
    const key = toDateKey(utcDateToLocalCalendarDay(promo.date));
    const pct = Number(promo.discountPercent);
    const bestSoFar = promoDiscountByDateKey.get(key);
    if (bestSoFar === undefined || pct > bestSoFar) {
      promoDiscountByDateKey.set(key, pct);
    }
  }
  // Total promo savings across the whole stay, in percentage-points of
  // one night/tour's own rate — surfaced on the returned quote so the
  // visitor booking review page can show "Promo applied: -5%" instead of
  // silently baking it into the total with no line item.
  let promoNightsDiscounted = 0;

  if (bookingType === "overnight") {
    const seasonalPrices = rules.seasonalPricingEnabled && room
      ? await client.seasonalPrice.findMany({ where: { roomId: room.id } })
      : [];

    for (let i = 0; i < nights; i++) {
      const nightDate = new Date(checkIn);
      nightDate.setDate(nightDate.getDate() + i);

      let nightlyRate = findSeasonalRate(nightDate, seasonalPrices) ?? Number(room.pricePerNight);

      // Friday (5) / Saturday (6) weekend surcharge
      const dayOfWeek = nightDate.getDay();
      if (rules.weekendSurchargePercent > 0 && (dayOfWeek === 5 || dayOfWeek === 6)) {
        nightlyRate *= 1 + rules.weekendSurchargePercent / 100;
      }

      // Promo Date discount — applied per night, same pattern as the
      // weekend surcharge above. Only the specific matching night(s) are
      // discounted, not the whole stay.
      const promoPercentForNight = promoDiscountByDateKey.get(toDateKey(nightDate));
      if (promoPercentForNight) {
        nightlyRate *= 1 - promoPercentForNight / 100;
        promoNightsDiscounted += 1;
      }

      subtotal += nightlyRate;
    }
  } else {
    // Flat rate for the room the visitor picked — not multiplied by
    // numberOfGuests. The party size is still capped above (room
    // capacity) and by the active rule's Allowed Guests/Total Pax, but
    // it no longer changes the price itself.
    subtotal = bookingType === "day_tour" ? Number(room.dayTourPrice) : Number(room.nightTourPrice);

    const promoPercentForDate = promoDiscountByDateKey.get(toDateKey(checkIn));
    if (promoPercentForDate) {
      subtotal *= 1 - promoPercentForDate / 100;
      promoNightsDiscounted += 1;
    }
  }

  // Last-minute discount — check-in within the next few days
  if (rules.lastMinuteDiscountPercent > 0 && daysOut <= LAST_MINUTE_WINDOW_DAYS) {
    subtotal *= 1 - rules.lastMinuteDiscountPercent / 100;
  }

  // Group discount — large party size
  if (rules.groupDiscountPercent > 0 && numberOfGuests >= rules.groupDiscountThreshold) {
    subtotal *= 1 - rules.groupDiscountPercent / 100;
  }

  const total = Math.round(subtotal * 100) / 100;
  const depositAmount = rules.depositRequired ? Math.round(total * (rules.depositPercentage / 100) * 100) / 100 : 0;

  // --- Scheduled start moment (Pending-Hold Countdown capping) ---
  // The real wall-clock moment this booking is actually scheduled to
  // begin — reuses effectiveCheckInAt when Same-Day auto-adjust already
  // shifted it, otherwise combines checkIn with this booking type's own
  // start time. Returned so app/api/bookings/route.js can compare it
  // against the full DP Countdown window (services/pendingHoldHours.js)
  // and cap the hold at whichever comes first — a Day Tour starting in
  // 2 hours must never advertise the full 8-hour hold.
  const scheduledStartTimeByType = {
    overnight: rules.checkInTime,
    day_tour: rules.dayTourStartTime,
    night_tour: rules.nightTourStartTime,
  };
  const scheduledStartAt = effectiveCheckInAt ?? combineDateAndTime(checkIn, scheduledStartTimeByType[bookingType]);

  return {
    nights,
    howManySelectedDates: nights,
    matchedRuleName: rules.name,
    checkInDate: toDateKey(checkIn),
    checkOutDate: toDateKey(checkOut),
    total,
    depositAmount,
    depositRequired: rules.depositRequired,
    checkInTime: rules.checkInTime,
    checkOutTime: rules.checkOutTime,
    // How many of this booking's nights/tour-date matched an active
    // Promo Date and had a discount applied — 0 means no promo applied.
    // Lets the visitor booking review page show a "Promo applied" line
    // instead of a total that just looks discounted with no explanation.
    promoNightsDiscounted,
    // Cleaning Hours that governed THIS specific booking — the
    // resort-wide value at the moment of booking, snapshotted onto the
    // Booking row (cleaningHoursSnapshot) at create time so a later
    // change to the global setting never rewrites what already-made
    // bookings are checked against. See services/cleaningHours.js and
    // services/cleaningBuffer.js.
    cleaningHours: globalCleaningHours,
    // Non-null only when Same-Day Check-In Policy auto-adjusted this
    // specific booking (see block above) — the create route persists
    // these onto the Booking row; the quote preview route just returns
    // them as-is so the visitor form can show "Adjusted check-in: ..."
    effectiveCheckInAt: effectiveCheckInAt ? effectiveCheckInAt.toISOString() : null,
    effectiveCheckOutAt: effectiveCheckOutAt ? effectiveCheckOutAt.toISOString() : null,
    // See scheduledStartAt computation above — always set, unlike
    // effectiveCheckInAt which is null unless Same-Day auto-adjust fired.
    scheduledStartAt: scheduledStartAt.toISOString(),
    cancellationCutoffDays: rules.cancellationCutoffDays,
    refundPercentage: rules.refundPercentage,
    room: room
      ? {
          id: room.id,
          name: room.name,
          pricePerNight: Number(room.pricePerNight),
          dayTourPrice: Number(room.dayTourPrice),
          nightTourPrice: Number(room.nightTourPrice),
        }
      : null,
  };
}