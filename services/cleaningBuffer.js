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
 * Note: cleaningHours itself is now a resort-wide value (SystemSettings,
 * see services/cleaningHours.js) rather than a per-rule-set column —
 * this file doesn't care where the number comes from, it just checks
 * the given check-in/check-out times against it.
 *
 * Used by:
 *   - app/api/superAdmin/settings/booking-rules/route.js (POST/create) —
 *     checks a rule set's own times against the current global value
 *   - app/api/superAdmin/settings/booking-rules/[ruleId]/route.js (PUT/update) — same
 *   - app/api/superAdmin/settings/cleaning-hours/route.js (PUT) —
 *     checks a new global value against every currently Active rule set
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
 * @param {boolean} nextOccurrenceIsNextDay - true for booking types whose
 *   check-in happens EARLIER in the clock than their own check-out on the
 *   same calendar day (Day Tour, Night Tour — a full same-day session).
 *   For these, the "next" time this type needs the room again is
 *   TOMORROW's start time, not today's — so the check-in comparison
 *   point is shifted forward by 24h. Overnight stays don't set this:
 *   their checkout (e.g. 11:00 AM) naturally precedes the SAME day's
 *   next check-in (e.g. 2:00 PM), which is the real turnover this check
 *   was designed for.
 */
export function findCleaningBufferConflict(checkInTime, checkOutTime, cleaningHours, { nextOccurrenceIsNextDay = false } = {}) {
  if (!checkInTime || !checkOutTime || !Number.isFinite(Number(cleaningHours))) return null;

  const checkOutMinutes = timeToMinutes(checkOutTime);
  const rawCheckInMinutes = timeToMinutes(checkInTime);
  // Shift the comparison point 24h forward for same-day session types
  // (Day Tour, Night Tour) — the room isn't needed again until
  // tomorrow's session, not later today.
  const nextNeededByMinutes = nextOccurrenceIsNextDay ? rawCheckInMinutes + 1440 : rawCheckInMinutes;
  const cleaningEndsMinutes = checkOutMinutes + Number(cleaningHours) * 60;

  const conflict = cleaningEndsMinutes > nextNeededByMinutes;
  if (!conflict) return null;

  const cleaningEndsDisplay = minutesToDisplayTime(cleaningEndsMinutes);
  const dayLabel = cleaningEndsMinutes >= 1440 ? " (next day)" : "";
  const turnoverLabel = nextOccurrenceIsNextDay ? "before tomorrow's session starts" : "on the same turnover day";

  return (
    `Checkout (${minutesToDisplayTime(checkOutMinutes)}) + ${cleaningHours}h cleaning doesn't finish until ` +
    `${cleaningEndsDisplay}${dayLabel} — later than your Check-in time (${minutesToDisplayTime(rawCheckInMinutes)}) ` +
    `${turnoverLabel}. Back-to-back bookings would overlap with the outgoing guest. ` +
    `Please adjust Check-in/Check-out time or reduce Cleaning Hours.`
  );
}

// Maps each booking type's check-in/check-out field pair to the actual
// form field names on BookingRule, so a caller can tell the admin
// exactly which field(s) to fix instead of just showing a message.
const BOOKING_TYPE_TIME_FIELDS = [
  { type: "overnight", label: "Overnight Stay", checkInField: "checkInTime", checkOutField: "checkOutTime", nextOccurrenceIsNextDay: false },
  { type: "day_tour", label: "Day Tour", checkInField: "dayTourStartTime", checkOutField: "dayTourEndTime", nextOccurrenceIsNextDay: true },
  { type: "night_tour", label: "Night Tour", checkInField: "nightTourStartTime", checkOutField: "nightTourEndTime", nextOccurrenceIsNextDay: true },
];

/**
 * findAllCleaningBufferConflicts
 * Runs findCleaningBufferConflict() against EVERY booking type's own
 * check-in/check-out time pair (Overnight, Day Tour, Night Tour) on a
 * single rule set, using the SAME cleaningHours value passed in — since
 * Cleaning Hours is resort-wide now (see services/cleaningHours.js),
 * this same helper is reused two ways: (1) checking one rule set's own
 * time fields against the current global value, and (2) checking a
 * proposed NEW global value against each Active rule set's time fields
 * in turn. Stops at the first conflict found (checked in the order
 * above) and returns which exact field(s) caused it, so the caller can
 * highlight them instead of leaving the admin to guess which of the 6
 * time fields is the problem.
 *
 * @param {object} values        - object with checkInTime/checkOutTime,
 *                                 dayTourStartTime/dayTourEndTime,
 *                                 nightTourStartTime/nightTourEndTime
 * @param {number} cleaningHours - the resort-wide cleaning hours value to check against
 * @returns {{ message: string, fields: string[] } | null}
 */
export function findAllCleaningBufferConflicts(values, cleaningHours) {
  for (const pair of BOOKING_TYPE_TIME_FIELDS) {
    const checkInValue = values?.[pair.checkInField];
    const checkOutValue = values?.[pair.checkOutField];
    if (!checkInValue || !checkOutValue) continue; // type not configured yet — nothing to check

    const conflictMessage = findCleaningBufferConflict(checkInValue, checkOutValue, cleaningHours, {
      nextOccurrenceIsNextDay: pair.nextOccurrenceIsNextDay,
    });
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
