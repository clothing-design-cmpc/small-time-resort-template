/**
 * FILE: services/cleaningHours.js
 * PURPOSE:
 * Central helper for the Cleaning Hours setting — ONE resort-wide value
 * (SystemSettings.cleaningHours), not per BookingRule. Every read/write
 * goes through here so services/roomStatus.js, services/bookingPricing.js,
 * and app/api/superAdmin/settings/cleaning-hours/route.js all agree on
 * the exact same value — same singleton-upsert pattern as
 * services/adminAccessLimit.js uses for SystemSettings.maxAdminSessions.
 *
 * HISTORY: previously this lived on BookingRule.cleaningHours (per rule
 * set — Overnight/Day Tour/Night Tour could each be governed by a
 * different Active rule set, and each carried its own cleaning window).
 * Moved to SystemSettings so the whole resort shares exactly one
 * cleaning-buffer window no matter which rule set(s) are Active.
 */
import { prisma } from "./prisma.js";

/**
 * getGlobalCleaningHours
 * Returns the resort-wide Cleaning Hours value. Upserts the singleton
 * row on first read so a fresh deployment never throws just because
 * SystemSettings hasn't been touched yet.
 */
export async function getGlobalCleaningHours() {
  const settings = await prisma.systemSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    select: { cleaningHours: true },
  });
  return settings.cleaningHours;
}

/**
 * updateGlobalCleaningHours
 * Saves a new resort-wide Cleaning Hours value. Range validation
 * (0-24) and the cleaning-buffer conflict check both happen in the
 * caller (app/api/superAdmin/settings/cleaning-hours/route.js) before
 * this is called — this function only persists the already-validated
 * value.
 *
 * @param cleaningHours - integer hours, 0-24
 * @param updatedBy     - AdminProfile.id (uid) of the super-admin saving this
 */
export async function updateGlobalCleaningHours(cleaningHours, updatedBy) {
  return prisma.systemSettings.upsert({
    where: { id: "singleton" },
    update: { cleaningHours, updatedAt: new Date(), updatedBy: updatedBy ?? null },
    create: { id: "singleton", cleaningHours, updatedBy: updatedBy ?? null },
    select: { cleaningHours: true },
  });
}
