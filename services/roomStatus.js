/**
 * FILE: services/roomStatus.js
 * PURPOSE:
 * Computes each room's CURRENT status for Booking Rules Section 6 —
 * the auto lifecycle requested: a confirmed booking makes a room
 * "Booked" for its stay, then "Checked-Out — Cleaning" for a
 * resort-wide configurable window after checkout
 * (BookingRule.cleaningHours, on the currently active rule set), then "Available" once that window
 * passes — with no manual date-range entry needed for any of those
 * three states. A manual BlackoutDate row (reason: Maintenance,
 * Private, or Custom — "Cleaning" is no longer a manual option, since
 * cleaning is now fully automatic) always takes priority over the
 * auto-computed booking states, since it represents a deliberate
 * admin decision to take the room offline regardless of booking data.
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
 * Picks the right pair of "HH:mm" schedule fields off the active
 * BookingRule based on this specific booking's bookingType, then
 * combines them with the booking's checkInDate/checkOutDate into real
 * check-in/checkout instants.
 */
function getCheckInOutMoments(booking, activeRule) {
  if (booking.bookingType === "day_tour") {
    return {
      checkInMoment: combineDateAndTime(booking.checkInDate, activeRule.dayTourStartTime),
      checkOutMoment: combineDateAndTime(booking.checkOutDate, activeRule.dayTourEndTime),
    };
  }
  if (booking.bookingType === "night_tour") {
    return {
      checkInMoment: combineDateAndTime(booking.checkInDate, activeRule.nightTourStartTime),
      checkOutMoment: combineDateAndTime(booking.checkOutDate, activeRule.nightTourEndTime),
    };
  }
  // Default: overnight
  return {
    checkInMoment: combineDateAndTime(booking.checkInDate, activeRule.checkInTime),
    checkOutMoment: combineDateAndTime(booking.checkOutDate, activeRule.checkOutTime),
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
  const [rooms, activeRule, manualBlackouts, confirmedBookings] = await Promise.all([
    prisma.room.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getActiveBookingRule("overnight"), // room turnover/cleaning only applies to overnight stays
    prisma.blackoutDate.findMany({ where: { reason: { in: MANUAL_REASONS } } }),
    prisma.booking.findMany({ where: { status: "confirmed" } }),
  ]);
  // Per-rule-set, not resort-wide — see the field's own schema comment.
  const cleaningHours = activeRule.cleaningHours ?? 2;

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
      .map((booking) => ({ booking, ...getCheckInOutMoments(booking, activeRule) }))
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
      const cleaningEndsAt = new Date(mostRecentCheckout.checkOutMoment);
      cleaningEndsAt.setHours(cleaningEndsAt.getHours() + cleaningHours);
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
