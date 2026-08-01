/**
 * FILE: services/pendingHoldHours.js
 * PURPOSE:
 * Central helper for the "DP Countdown" setting — ONE resort-wide value
 * (SystemSettings.pendingHoldHours): how many hours a newly-created
 * "pending" Booking holds its dates before it auto-expires. Every
 * read/write goes through here so app/api/bookings/route.js and
 * app/api/superAdmin/settings/pending-hold-hours/route.js always agree
 * on the exact same value — same singleton-upsert pattern as
 * services/cleaningHours.js uses for SystemSettings.cleaningHours.
 *
 * WHY CHANGING THIS NEVER BREAKS AN ACTIVE PENDING BOOKING:
 * This function only ever returns the CURRENT setting. It is read once,
 * at the moment a NEW booking is created (app/api/bookings/route.js),
 * to compute that one booking's Booking.pendingExpiresAt timestamp —
 * which is then saved directly on the row. From that point on, nothing
 * ever re-reads this setting for that booking again: the cron sweep
 * (app/api/cron/booking-expiry/route.js) and the visitor-facing
 * countdown widget (components/shared/BookingProgressWidget.jsx) both
 * compare against Booking.pendingExpiresAt only. So a super-admin
 * changing this value mid-flight can only ever affect bookings created
 * AFTER the change — every already-pending booking keeps counting down
 * against its own already-saved timestamp, untouched.
 */
import { prisma } from "./prisma.js";

// Fallback used only if the singleton row's field is somehow null
// (should never happen once the schema default of 8 has been applied
// via `prisma db push`, but keeps this function defensive regardless).
const DEFAULT_PENDING_HOLD_HOURS = 8;

/**
 * getGlobalPendingHoldHours
 * Returns the resort-wide DP Countdown value, in hours. Upserts the
 * singleton row on first read so a fresh deployment never throws just
 * because SystemSettings hasn't been touched yet.
 */
export async function getGlobalPendingHoldHours() {
  const settings = await prisma.systemSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    select: { pendingHoldHours: true },
  });
  return settings.pendingHoldHours ?? DEFAULT_PENDING_HOLD_HOURS;
}

/**
 * updateGlobalPendingHoldHours
 * Saves a new resort-wide DP Countdown value. Range validation happens
 * in the caller (app/api/superAdmin/settings/pending-hold-hours/route.js)
 * before this is called — this function only persists the
 * already-validated value. Never touches any existing Booking row, so
 * every currently-pending booking's own pendingExpiresAt is left exactly
 * as it was.
 *
 * @param pendingHoldHours - integer hours, > 0
 * @param updatedBy        - AdminProfile.id (uid) of the super-admin saving this
 */
export async function updateGlobalPendingHoldHours(pendingHoldHours, updatedBy) {
  return prisma.systemSettings.upsert({
    where: { id: "singleton" },
    update: { pendingHoldHours, updatedAt: new Date(), updatedBy: updatedBy ?? null },
    create: { id: "singleton", pendingHoldHours, updatedBy: updatedBy ?? null },
    select: { pendingHoldHours: true },
  });
}
