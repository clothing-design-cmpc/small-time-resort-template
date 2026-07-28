/**
 * FILE: services/bookingTypeFlags.js
 * PURPOSE:
 * The "Uri ng Booking" control on BookingRuleForm.jsx is a single-select
 * radio (Overnight Stay / Day Tour / Night Tour) — a rule set is only
 * ever meant to represent ONE of these. The form's onChange handlers
 * already zero out the other two flags whenever the admin clicks a
 * radio option, but the API routes were saving whatever the client
 * body contained with no server-side check — so a rule set carrying a
 * stale/incorrect combination (e.g. allowOvernightStay left true on a
 * rule really meant for Day Tour, from before this radio existed, or
 * from any other client that didn't clear it) would silently persist
 * forever, since nothing ever corrected it on save.
 *
 * This is exactly what caused a same-day Day Tour rule set to win the
 * "most recently updated" tie-break for an Overnight booking's rule
 * match (services/bookingRules.js -> getActiveBookingRuleForDateCount())
 * every time an admin merely opened and saved that Day Tour rule set —
 * its allowOvernightStay flag was still (incorrectly) true underneath.
 *
 * normalizeBookingTypeFlags enforces exclusivity server-side,
 * regardless of what the client sends, using the precedence Overnight
 * > Day Tour > Night Tour if more than one somehow arrives true.
 */

/**
 * normalizeBookingTypeFlags
 * Takes the raw allowOvernightStay/allowDayTour/allowNightTour values
 * from a request body and returns exactly one of them true (or all
 * false if none were). Returns all three as `undefined` when NONE of
 * the three keys were present in the body at all, so Prisma's normal
 * "skip undefined -> leave existing DB value untouched" behavior for
 * a partial update is preserved rather than being forced.
 */
export function normalizeBookingTypeFlags(body) {
  const { allowOvernightStay, allowDayTour, allowNightTour } = body;

  const noneProvided =
    allowOvernightStay === undefined && allowDayTour === undefined && allowNightTour === undefined;
  if (noneProvided) {
    return { allowOvernightStay: undefined, allowDayTour: undefined, allowNightTour: undefined };
  }

  if (allowOvernightStay) return { allowOvernightStay: true, allowDayTour: false, allowNightTour: false };
  if (allowDayTour) return { allowOvernightStay: false, allowDayTour: true, allowNightTour: false };
  if (allowNightTour) return { allowOvernightStay: false, allowDayTour: false, allowNightTour: true };
  return { allowOvernightStay: false, allowDayTour: false, allowNightTour: false };
}
