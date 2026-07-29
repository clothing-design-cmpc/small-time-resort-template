/**
 * FILE: utils/formatTime.js
 * PURPOSE:
 * Converts a 24-hour "HH:mm" time string (how BookingRule.checkInTime,
 * checkOutTime, dayTourStartTime, etc. are stored) into a guest-friendly
 * 12-hour "h:mm AM/PM" string for display. Every visitor-facing screen
 * that shows a booking's check-in/check-out time should run it through
 * this helper instead of rendering the raw stored value.
 *
 * Passes non-"HH:mm" input straight through unchanged (e.g. already
 * human-formatted strings, or null/undefined) so it's safe to wrap
 * around any time value without double-converting.
 */

/**
 * formatTime12Hour
 * Converts "HH:mm" (24-hour) to "h:mm AM/PM" (12-hour).
 * Returns the original value unchanged if it isn't in "HH:mm" shape.
 *
 * @param {string|null|undefined} hhmm - e.g. "14:00", "09:30"
 */
export function formatTime12Hour(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return hhmm ?? "";

  const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return hhmm; // Already formatted or not a recognized time — leave as-is

  const hour24 = Number(match[1]);
  const minute = match[2];

  if (Number.isNaN(hour24) || hour24 < 0 || hour24 > 23) return hhmm;

  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return `${hour12}:${minute} ${period}`;
}
