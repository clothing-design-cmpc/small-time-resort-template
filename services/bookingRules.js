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
 * dateKeyToUTCMidnight
 * Converts a "YYYY-MM-DD" key into a Date representing EXACT UTC
 * midnight of that calendar date — the same representation Prisma
 * returns when reading a @db.Date column back from Postgres. Deliberately
 * NOT passed through startOfDay() (which uses local setHours and would
 * silently re-normalize this back to local midnight, discarding the
 * "Z" and reintroducing the bug described where checkIn/checkOut ended
 * up 8 hours "behind" true UTC midnight on a UTC+8 server — enough to
 * make a checkout day falsely register as still inside the previous
 * booking's occupied range). Use this — not startOfDay(new Date(...)) —
 * for any date that gets directly compared against a DB-read
 * checkInDate/checkOutDate/startDate/endDate field.
 */
function dateKeyToUTCMidnight(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`);
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
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
 * @param {string|null} input.roomId
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
    const provisionalCheckIn = dateKeyToUTCMidnight(checkInDate);
    const provisionalCheckOut = dateKeyToUTCMidnight(checkOutDate);
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

  // "Today" as experienced by the resort's local calendar (not the UTC
  // calendar date, which could still be "yesterday" during early-morning
  // hours on a positive-offset server) — extracted via LOCAL getters,
  // then represented as UTC midnight of that local date so it's directly
  // comparable to checkIn below (see dateKeyToUTCMidnight's doc comment).
  const today = dateKeyToUTCMidnight(toDateKey(new Date()));
  const checkIn = dateKeyToUTCMidnight(checkInDate);

  if (Number.isNaN(checkIn.getTime()) || checkIn < today) {
    throw new Error("Check-in date must be today or later.");
  }

  const daysOut = daysBetween(today, checkIn);
  if (daysOut > rules.advanceBookingDays) {
    throw new Error(`Bookings can only be made up to ${rules.advanceBookingDays} days in advance.`);
  }

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

  // --- Room lookup (overnight requires one; tours may optionally reference one for capacity context) ---
  let room = null;
  if (roomId) {
    room = await client.room.findUnique({ where: { id: roomId } });
    if (!room || !room.isActive) {
      throw new Error("The selected room is no longer available.");
    }
    if (numberOfGuests > room.capacity) {
      throw new Error(`This room fits up to ${room.capacity} guest(s).`);
    }
  }

  // --- Overnight-only: nights range, room availability ---
  let checkOut = checkIn;
  let nights = 0;

  if (bookingType === "overnight") {
    if (!roomId) throw new Error("Please select a room for an overnight stay.");
    if (!checkOutDate) throw new Error("Please select a check-out date.");

    checkOut = dateKeyToUTCMidnight(checkOutDate);
    nights = daysBetween(checkIn, checkOut);

    if (nights < 1) {
      throw new Error("Check-out date must be after check-in date.");
    }

    // Nights range now comes only from the currently active BookingRule
    // (Settings > Booking Rules) — rooms no longer carry their own
    // override, so there's exactly one place an admin needs to check.
    if (nights < rules.minNightsRequired) {
      throw new Error(`This stay requires a minimum of ${rules.minNightsRequired} night(s).`);
    }
    if (nights > rules.maxNightsAllowed) {
      throw new Error(`This stay cannot exceed ${rules.maxNightsAllowed} nights.`);
    }
  }

  // --- Type-exclusivity check against existing confirmed bookings ---
  // Uses `client` (not the global `prisma`) so this read happens inside the
  // same transaction as the eventual booking.create() in
  // app/api/bookings/route.js — the Serializable isolation level then makes
  // Postgres itself detect if a concurrent request already booked these
  // dates between this read and that write.
  //
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
    const existingBookings = await client.booking.findMany({
      where: { status: "confirmed" },
      select: { checkInDate: true, checkOutDate: true, bookingType: true },
    });

    // Day Tour / Night Tour bookings occupy exactly one date
    // (checkInDate === checkOutDate) — treat that single date as
    // occupying [date, date+1) for the same half-open range comparison
    // used for Overnight-vs-Overnight overlap below.
    const requestedOverlaps = existingBookings.some((existing) => {
      const existingCheckOut =
        existing.bookingType === "overnight"
          ? existing.checkOutDate
          : new Date(existing.checkInDate.getTime() + 86400000);
      return checkIn < existingCheckOut && checkOut > existing.checkInDate;
    });
    if (requestedOverlaps) {
      throw new Error("Those dates were just booked. Please pick a different date.");
    }

    const blackoutRanges = await client.blackoutDate.findMany({
      where: { roomId },
      select: { startDate: true, endDate: true, reason: true },
    });
    const hitsBlackout = blackoutRanges.some(
      (blackout) => checkIn < blackout.endDate && checkOut > blackout.startDate
    );
    if (hitsBlackout) {
      throw new Error("This room is closed for part of your selected date range. Please pick a different date.");
    }
  }

  // Day Tour / Night Tour: no room-based overlap check needed (tours
  // don't lock a specific room the way an Overnight stay does), but an
  // existing Overnight booking on this date DOES conflict — the villa
  // is already exclusively occupied that day. Day Tour and Night Tour
  // never conflict with each other (see exclusivity rule above), so
  // this only ever checks against confirmed Overnight bookings.
  if (bookingType === "day_tour" || bookingType === "night_tour") {
    const conflictingOvernightStay = await client.booking.findFirst({
      where: {
        status: "confirmed",
        bookingType: "overnight",
        checkInDate: { lte: checkIn },
        checkOutDate: { gt: checkIn },
      },
      select: { id: true },
    });
    if (conflictingOvernightStay) {
      throw new Error("The villa is already booked for an overnight stay on this date. Please pick a different date.");
    }
  }

  // --- Pricing ---
  let subtotal = 0;

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

      subtotal += nightlyRate;
    }
  } else {
    const perGuestRate =
      bookingType === "day_tour" ? Number(rules.dayTourPricePerGuest) : Number(rules.nightTourPricePerGuest);
    subtotal = perGuestRate * numberOfGuests;
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
    cancellationCutoffDays: rules.cancellationCutoffDays,
    refundPercentage: rules.refundPercentage,
    room: room ? { id: room.id, name: room.name, pricePerNight: Number(room.pricePerNight) } : null,
  };
}