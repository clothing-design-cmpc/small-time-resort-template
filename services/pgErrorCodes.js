/**
 * FILE: services/pgErrorCodes.js
 * PURPOSE:
 * Recognizes specific Postgres SQLSTATE error codes coming back through
 * Prisma, so route handlers can react to them with a friendly message
 * instead of a generic 500. Written defensively because Prisma's error
 * wrapping differs slightly by version/call type — the raw code can show
 * up as `error.meta.code`, inside `error.message`, or on a nested
 * `error.cause`, so every check looks in all three places.
 *
 * Used by app/api/bookings/route.js as part of the double-booking race
 * condition fix (deep search Section 2):
 *   - 23P01 = exclusion_violation  -> the DB-level EXCLUDE constraint
 *     (prisma/addBookingExclusionConstraint.js) rejected an overlapping
 *     confirmed booking.
 *   - 40001 = serialization_failure -> the Serializable transaction
 *     detected a read-write conflict with another concurrent booking
 *     request and aborted this one so data stays consistent.
 */

/**
 * getPostgresErrorCode
 * Digs the raw Postgres SQLSTATE code out of a Prisma error, checking
 * every place it's known to surface. Returns null if none is found.
 */
function getPostgresErrorCode(error) {
  return (
    error?.meta?.code ??
    error?.cause?.meta?.code ??
    error?.meta?.driverAdapterError?.cause?.code ??
    null
  );
}

/**
 * messageMentionsCode
 * Fallback check — some Prisma versions only surface the SQLSTATE inside
 * the free-text error message rather than a structured field.
 */
function messageMentionsCode(error, code) {
  return typeof error?.message === "string" && error.message.includes(code);
}

/**
 * isExclusionViolation
 * True if this error is Postgres rejecting an overlapping booking via
 * the no_overlapping_bookings EXCLUDE constraint (SQLSTATE 23P01).
 */
export function isExclusionViolation(error) {
  return (
    getPostgresErrorCode(error) === "23P01" ||
    messageMentionsCode(error, "23P01") ||
    messageMentionsCode(error, "no_overlapping_bookings")
  );
}

/**
 * isSerializationFailure
 * True if this error is Postgres aborting a Serializable transaction due
 * to a detected read-write conflict with a concurrent transaction
 * (SQLSTATE 40001) — safe and expected to retry once.
 */
export function isSerializationFailure(error) {
  return (
    getPostgresErrorCode(error) === "40001" ||
    messageMentionsCode(error, "40001") ||
    messageMentionsCode(error, "could not serialize access")
  );
}
