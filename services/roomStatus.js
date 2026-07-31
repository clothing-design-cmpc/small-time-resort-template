/**
 * FILE: services/roomStatus.js
 * PURPOSE:
 * Computes each room's CURRENT status for Booking Rules Section 6 —
 * the auto lifecycle requested: a confirmed booking makes a room
 * "Booked" for its stay, then "Checked-Out — Cleaning" for a
 * configurable window after checkout (SystemSettings.cleaningHours —
 * ONE resort-wide value, shared by every booking type and every rule
 * set — see services/cleaningHours.js), then "Available" once that
 * window passes — with no manual date-range
 * entry needed for any of those three states. A manual BlackoutDate row
 * (reason: Maintenance, Private, or Custom — "Cleaning" is no longer a
 * manual option, since cleaning is now fully automatic) always takes
 * priority over the auto-computed booking states, since it represents a
 * deliberate admin decision to take the room offline regardless of
 * booking data.
 *
 * PRIORITY ORDER (highest wins):
 *   1. Manual BlackoutDate (Maintenance / Private / Custom) covering now
 *   2. Booked        — a confirmed booking's stay window covers now
 *   3. Cleaning       — now is within cleaningHours after that
 *                       booking's checkout moment
 *   4. Available      — none of the above
 */
import { prisma } from "@/services/prisma";
import { getActiveBookingRule } from "@/services/bookingRules";
import { getGlobalCleaningHours } from "@/services/cleaningHours";

const MANUAL_REASONS = ["Maintenance", "Private", "Custom"];

/**
 * combineDateAndTime
 * Combines a @db.Date-only value (midnight, no time-of-day) with a
 * "HH:mm" 24-hour string from the active BookingRule into one real
 * Date/time instant, in Asia/Manila. BookingRule stores times as plain
 * "HH:mm" strings (not DateTime), since they're resort-wide schedule
 * settings, not tied to any one day.
 */
function combineDateAndTime(dateOnly, hhmm) {
  const [hours, minutes] = (hhmm ?? "12:00").split(":").map(Number);
  const manilaDateString = dateOnly.toLocaleString("en-US", { timeZone: "Asia/Manila" });
  const combined = new Date(manilaDateString);
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}

/**
 * getCheckInOutMoments
 * Picks the right pair of "HH:mm" schedule fields for this specific
 * booking's bookingType off THAT type's own active BookingRule (see
 * ruleByType below — Overnight, Day Tour, and Night Tour can each be
 * governed by a different rule set), then combines them with the
 * booking's checkInDate/checkOutDate into real check-in/checkout
 * instants.
 */
function getCheckInOutMoments(booking, ruleByType) {
  const rule = ruleByType[booking.bookingType] ?? ruleByType.overnight;

  if (booking.bookingType === "day_tour") {
    return {
      checkInMoment: combineDateAndTime(booking.checkInDate, rule.dayTourStartTime),
      checkOutMoment: combineDateAndTime(booking.checkOutDate, rule.dayTourEndTime),
    };
  }
  if (booking.bookingType === "night_tour") {
    return {
      checkInMoment: combineDateAndTime(booking.checkInDate, rule.nightTourStartTime),
      checkOutMoment: combineDateAndTime(booking.checkOutDate, rule.nightTourEndTime),
    };
  }
  // Default: overnight
  return {
    checkInMoment: combineDateAndTime(booking.checkInDate, rule.checkInTime),
    checkOutMoment: combineDateAndTime(booking.checkOutDate, rule.checkOutTime),
  };
}

/**
 * getAllRoomStatuses
 * Returns one entry per active Room: { room, status, label, auto,
 * since, until }. `status` is one of "booked" | "cleaning" |
 * "maintenance" | "private" | "custom" | "available". `auto` is false
 * only for the manual BlackoutDate case.
 */
export async function getAllRoomStatuses(now = new Date()) {
  const [rooms, overnightRule, dayTourRule, nightTourRule, manualBlackouts, confirmedBookings, globalCleaningHours] =
    await Promise.all([
      prisma.room.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      getActiveBookingRule("overnight"),
      getActiveBookingRule("day_tour"),
      getActiveBookingRule("night_tour"),
      prisma.blackoutDate.findMany({ where: { reason: { in: MANUAL_REASONS } } }),
      prisma.booking.findMany({ where: { status: "confirmed" } }),
      getGlobalCleaningHours(),
    ]);
  // Each booking type can be governed by its own active rule set — a Day
  // Tour checkout is no longer forced through the Overnight rule's
  // checkOutTime just because that's the rule this function fetched.
  // Cleaning Hours itself, however, is resort-wide now (globalCleaningHours
  // above), not per rule set.
  const ruleByType = { overnight: overnightRule, day_tour: dayTourRule, night_tour: nightTourRule };

  return rooms.map((room) => {
    // Priority 1 — manual override covering today, for this room.
    const activeManualBlackout = manualBlackouts.find(
      (blackout) =>
        blackout.roomId === room.id &&
        now >= new Date(blackout.startDate) &&
        now <= new Date(new Date(blackout.endDate).setHours(23, 59, 59, 999))
    );
    if (activeManualBlackout) {
      return {
        room,
        status: activeManualBlackout.reason.toLowerCase(),
        label: activeManualBlackout.reason,
        auto: false,
        since: activeManualBlackout.startDate,
        until: activeManualBlackout.endDate,
        blackoutId: activeManualBlackout.id,
      };
    }

    // Priority 2/3 — the most relevant confirmed booking for this room:
    // whichever one's checkout is closest to (at or before) now, since
    // that's the only booking whose Booked/Cleaning window could still
    // be active. Bookings fully in the future or long in the past for
    // this room don't affect its CURRENT status.
    const roomBookings = confirmedBookings
      .filter((booking) => booking.roomId === room.id)
      .map((booking) => ({ booking, ...getCheckInOutMoments(booking, ruleByType) }))
      .sort((a, b) => b.checkOutMoment - a.checkOutMoment);

    const currentStay = roomBookings.find((entry) => now >= entry.checkInMoment && now <= entry.checkOutMoment);
    if (currentStay) {
      return {
        room,
        status: "booked",
        label: "Booked",
        auto: true,
        since: currentStay.checkInMoment,
        until: currentStay.checkOutMoment,
      };
    }

    const mostRecentCheckout = roomBookings.find((entry) => entry.checkOutMoment <= now);
    if (mostRecentCheckout) {
      // Prefer the Cleaning Hours snapshotted on THAT booking at create
      // time (see services/cleaningBuffer.js / bookingPricing.js) — never
      // today's live global setting — so an owner changing Cleaning Hours
      // afterward doesn't retroactively change a status already computed
      // for a past booking. Falls back to the current global value for
      // bookings made before the snapshot column existed.
      const cleaningHoursForBooking = mostRecentCheckout.booking.cleaningHoursSnapshot ?? globalCleaningHours ?? 2;

      const cleaningEndsAt = new Date(mostRecentCheckout.checkOutMoment);
      cleaningEndsAt.setHours(cleaningEndsAt.getHours() + cleaningHoursForBooking);
      if (now <= cleaningEndsAt) {
        return {
          room,
          status: "cleaning",
          label: "Checked-Out — Cleaning",
          auto: true,
          since: mostRecentCheckout.checkOutMoment,
          until: cleaningEndsAt,
        };
      }
    }

    // Priority 4 — nothing else applies.
    return { room, status: "available", label: "Available", auto: true, since: null, until: null };
  });
}