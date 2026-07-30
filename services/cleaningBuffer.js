/**
 * FILE: services/cleaningBuffer.js
 * PURPOSE:
 * Shared server-side check for the cleaning-buffer conflict every other
 * part of this feature relies on: given a rule's Check-in Time,
 * Check-out Time, and Cleaning Hours, does the room actually finish
 * cleaning BEFORE the next guest's standard check-in time on that same
 * turnover day? If not, back-to-back bookings under this rule would
 * silently overlap in real life even though the old date-only overlap
 * check in services/bookingPricing.js would never catch it.
 *
 * Used by:
 *   - app/api/superAdmin/settings/booking-rules/route.js (POST/create)
 *   - app/api/superAdmin/settings/booking-rules/[ruleId]/route.js (PUT/update)
 *   - app/api/superAdmin/settings/cleaning-hours/route.js (PUT)
 *   - services/bookingPricing.js (real booking-vs-booking overlap check)
 *
 * ASSUMPTION (matches the existing overlap-check convention already in
 * services/bookingPricing.js): a back-to-back turnover means the
 * existing guest's checkOutDate is the SAME calendar date as the next
 * guest's checkInDate — standard same-day hotel turnover, not a full
 * extra day of buffer.
 */

/** Parses "HH:mm" into total minutes since midnight. */
function timeToMinutes(hhmm) {
  const [hour, minute] = String(hhmm).split(":").map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

/** Formats total minutes since midnight back into a human-readable 12-hour time. */
function minutesToDisplayTime(totalMinutes) {
  const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440; // wrap into a single day
  const hour24 = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

/**
 * findCleaningBufferConflict
 * Returns null when the turnover is safe, or a human-readable message
 * string describing the conflict when checkout + cleaning runs past
 * the next guest's check-in time on the same calendar day.
 *
 * @param {string} checkInTime   - "HH:mm", e.g. "14:00"
 * @param {string} checkOutTime  - "HH:mm", e.g. "23:00"
 * @param {number} cleaningHours - hours needed to clean after checkout
 */
export function findCleaningBufferConflict(checkInTime, checkOutTime, cleaningHours) {
  if (!checkInTime || !checkOutTime || !Number.isFinite(Number(cleaningHours))) return null;

  const checkOutMinutes = timeToMinutes(checkOutTime);
  const checkInMinutes = timeToMinutes(checkInTime);
  const cleaningEndsMinutes = checkOutMinutes + Number(cleaningHours) * 60;

  // Cleaning spills past midnight into the next calendar day — that's
  // always later than ANY same-day check-in time, guaranteed conflict.
  const spillsToNextDay = cleaningEndsMinutes >= 1440;

  const conflict = spillsToNextDay || cleaningEndsMinutes > checkInMinutes;
  if (!conflict) return null;

  const cleaningEndsDisplay = minutesToDisplayTime(cleaningEndsMinutes);
  const dayLabel = spillsToNextDay ? " (next day)" : "";

  return (
    `Checkout (${minutesToDisplayTime(checkOutMinutes)}) + ${cleaningHours}h cleaning doesn't finish until ` +
    `${cleaningEndsDisplay}${dayLabel} — later than your Check-in time (${minutesToDisplayTime(checkInMinutes)}) ` +
    `on the same turnover day. Back-to-back bookings would overlap with the outgoing guest. ` +
    `Please adjust Check-in/Check-out time or reduce Cleaning Hours.`
  );
}

// Maps each booking type's check-in/check-out field pair to the actual
// form field names on BookingRule, so a caller can tell the admin
// exactly which field(s) to fix instead of just showing a message.
const BOOKING_TYPE_TIME_FIELDS = [
  { type: "overnight", label: "Overnight Stay", checkInField: "checkInTime", checkOutField: "checkOutTime" },
  { type: "day_tour", label: "Day Tour", checkInField: "dayTourStartTime", checkOutField: "dayTourEndTime" },
  { type: "night_tour", label: "Night Tour", checkInField: "nightTourStartTime", checkOutField: "nightTourEndTime" },
];

/**
 * findAllCleaningBufferConflicts
 * Runs findCleaningBufferConflict() against EVERY booking type's own
 * check-in/check-out time pair (Overnight, Day Tour, Night Tour) using
 * the SAME shared cleaningHours value — a single BookingRule row holds
 * all three type pairs plus one cleaningHours column (see
 * prisma/schema.prisma), so a conflict on any one of them is a real,
 * saveable conflict for that rule set. Stops at the first conflict
 * found (checked in the order above) and returns which exact field(s)
 * caused it, so the admin form can highlight them instead of leaving
 * the admin to guess which of the 6 time fields is the problem.
 *
 * @param {object} values        - object with checkInTime/checkOutTime,
 *                                 dayTourStartTime/dayTourEndTime,
 *                                 nightTourStartTime/nightTourEndTime
 * @param {number} cleaningHours - shared cleaning hours for this rule set
 * @returns {{ message: string, fields: string[] } | null}
 */
export function findAllCleaningBufferConflicts(values, cleaningHours) {
  for (const pair of BOOKING_TYPE_TIME_FIELDS) {
    const checkInValue = values?.[pair.checkInField];
    const checkOutValue = values?.[pair.checkOutField];
    if (!checkInValue || !checkOutValue) continue; // type not configured yet — nothing to check

    const conflictMessage = findCleaningBufferConflict(checkInValue, checkOutValue, cleaningHours);
    if (conflictMessage) {
      return {
        message: `${pair.label}: ${conflictMessage}`,
        fields: [pair.checkInField, pair.checkOutField, "cleaningHours"],
      };
    }
  }
  return null;
}


/**
 * getCleaningEndsAt
 * Given an existing booking's actual checkout moment (a real Date) and
 * the cleaning hours that applied to it, returns the exact Date the
 * room becomes available again. Used by services/bookingPricing.js to
 * compare against a NEW booking's requested check-in moment.
 */
export function getCleaningEndsAt(checkOutMoment, cleaningHours) {
  return new Date(checkOutMoment.getTime() + Number(cleaningHours) * 60 * 60 * 1000);
}
