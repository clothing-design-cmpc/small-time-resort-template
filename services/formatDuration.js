/**
 * FILE: services/formatDuration.js
 * PURPOSE:
 * Turns a future Date into a human-readable "time remaining" phrase,
 * e.g. "1 hour and 47 minutes" or "7 hours". Used by
 * app/api/bookings/route.js's pending-booking email so the copy
 * always reflects THIS booking's actual Booking.pendingExpiresAt —
 * which may be capped short of the resort-wide DP Countdown setting
 * (see prisma/schema.prisma's pendingHoldCapped field and
 * app/api/bookings/route.js's createBookingInTransaction) — instead
 * of always printing the raw global SystemSettings.pendingHoldHours
 * number regardless of what actually happens to be true for this
 * specific booking.
 *
 * Zero imports — safe to import from both server and client code if
 * ever needed (e.g. a future countdown widget), though today it's
 * only used server-side by the pending-booking email.
 */

/**
 * formatTimeRemaining
 * @param {Date} targetDate - a future point in time (e.g. Booking.pendingExpiresAt)
 * @param {Date} [fromDate] - defaults to now; exposed for testability
 * @returns {string} e.g. "1 hour", "1 hour and 47 minutes", "7 hours",
 *   or "a few minutes" once the window is already down to under a minute.
 */
export function formatTimeRemaining(targetDate, fromDate = new Date()) {
  const diffMs = new Date(targetDate).getTime() - fromDate.getTime();

  // Already expired (or expiring within the same minute) by the time
  // this renders — never print a negative/zero duration to the guest.
  if (diffMs <= 60 * 1000) {
    return "a few minutes";
  }

  const totalMinutes = Math.round(diffMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const hourPart = hours > 0 ? `${hours} hour${hours === 1 ? "" : "s"}` : "";
  const minutePart = minutes > 0 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : "";

  if (hourPart && minutePart) return `${hourPart} and ${minutePart}`;
  return hourPart || minutePart || "a few minutes";
}
