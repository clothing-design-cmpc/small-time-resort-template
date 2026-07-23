/**
 * FILE: services/roomStatus.js
 * PURPOSE:
 * Computes the live status of every room for Booking Rules Section 6
 * (Blackout Dates / room showcase). A room's status is either:
 *   - A manual override (Maintenance | Private | Custom) from a
 *     BlackoutDate row that covers today — admin-set, wins over
 *     everything else.
 *   - An automatic state derived from confirmed bookings + the active
 *     BookingRule's checkInTime/checkOutTime/cleaningHours:
 *       "booked"    -> now falls inside [checkIn, checkOut)
 *       "cleaning"  -> now falls inside [checkOut, checkOut + cleaningHours)
 *       "available" -> neither of the above
 *
 * Never called from a Client Component — only from the room-status API
 * route (server-side, Rule 31.1).
 */
import { prisma } from "@/services/prisma";
import { getActiveBookingRule } from "@/services/bookingRules";

/**
 * combineDateAndTime
 * Merges a Date-only value (e.g. Booking.checkInDate, which Prisma
 * returns at midnight UTC) with a "HH:mm" time string into one
 * timestamp, so it can be compared directly against "now".
 */
function combineDateAndTime(dateValue, timeString) {
  const combined = new Date(dateValue);
  const [hours, minutes] = String(timeString ?? "00:00").split(":").map(Number);
  combined.setHours(hours || 0, minutes || 0, 0, 0);
  return combined;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * getRoomStatuses
 * Returns one status object per room, ordered the same way the Rooms
 * Management list is (sortOrder). Every room is included — there is no
 * filtering — so the Section 6 showcase always reflects every room
 * that exists, active or not.
 */
export async function getRoomStatuses() {
  const [rooms, rule] = await Promise.all([
    prisma.room.findMany({ orderBy: { sortOrder: "asc" } }),
    getActiveBookingRule(),
  ]);

  const now = new Date();
  const today = startOfToday();
  const cleaningHours = rule.cleaningHours ?? 2;

  // Only need bookings that could still be "current" or recently
  // checked out — widen the lower bound generously past the cleaning
  // window so a large cleaningHours value never misses a real match.
  const lookbackStart = new Date(now.getTime() - (cleaningHours + 24) * 60 * 60 * 1000);

  const [relevantBookings, activeBlackouts] = await Promise.all([
    prisma.booking.findMany({
      where: {
        status: "confirmed",
        roomId: { not: null },
        checkOutDate: { gte: lookbackStart },
        checkInDate: { lte: now },
      },
      orderBy: { checkOutDate: "desc" },
    }),
    prisma.blackoutDate.findMany({
      where: { startDate: { lte: today }, endDate: { gte: today } },
      orderBy: { startDate: "desc" },
    }),
  ]);

  const bookingsByRoom = new Map();
  for (const booking of relevantBookings) {
    if (!bookingsByRoom.has(booking.roomId)) bookingsByRoom.set(booking.roomId, []);
    bookingsByRoom.get(booking.roomId).push(booking);
  }

  // If more than one manual block somehow overlaps today for the same
  // room, the most recently started one wins (findMany above is
  // ordered startDate desc, so the first match per room is that one).
  const blackoutByRoom = new Map();
  for (const entry of activeBlackouts) {
    if (!blackoutByRoom.has(entry.roomId)) blackoutByRoom.set(entry.roomId, entry);
  }

  return rooms.map((room) => {
    const manualBlock = blackoutByRoom.get(room.id);
    if (manualBlock) {
      // Rows saved before "Cleaning" was removed as a manual reason
      // (see app/api/superAdmin/settings/blackout-dates/route.js) would
      // otherwise render with the same badge as the new auto-computed
      // "Cleaning (Auto)" state below — fall back to a generic key so
      // a manual override never looks like an automatic one.
      const validManualReasons = ["Maintenance", "Private", "Custom"];
      const statusKey = validManualReasons.includes(manualBlock.reason)
        ? manualBlock.reason.toLowerCase()
        : "custom";

      return {
        roomId: room.id,
        roomName: room.name,
        status: statusKey,
        reasonLabel: manualBlock.reason,
        source: "manual",
        blackoutId: manualBlock.id,
        startDate: manualBlock.startDate,
        endDate: manualBlock.endDate,
      };
    }

    const roomBookings = bookingsByRoom.get(room.id) ?? [];
    let currentBooking = null;
    let mostRecentCheckout = null;

    for (const booking of roomBookings) {
      const checkInAt = combineDateAndTime(booking.checkInDate, rule.checkInTime);
      const checkOutAt = combineDateAndTime(booking.checkOutDate, rule.checkOutTime);

      if (now >= checkInAt && now < checkOutAt) {
        currentBooking = { booking, checkInAt, checkOutAt };
        break;
      }
      if (checkOutAt <= now && (!mostRecentCheckout || checkOutAt > mostRecentCheckout.checkOutAt)) {
        mostRecentCheckout = { booking, checkOutAt };
      }
    }

    if (currentBooking) {
      return {
        roomId: room.id,
        roomName: room.name,
        status: "booked",
        source: "auto",
        guestName: currentBooking.booking.guestName,
        checkInDate: currentBooking.booking.checkInDate,
        checkOutDate: currentBooking.booking.checkOutDate,
        checkOutAt: currentBooking.checkOutAt,
      };
    }

    if (mostRecentCheckout) {
      const cleaningUntil = new Date(mostRecentCheckout.checkOutAt.getTime() + cleaningHours * 60 * 60 * 1000);
      if (now < cleaningUntil) {
        return {
          roomId: room.id,
          roomName: room.name,
          status: "cleaning",
          source: "auto",
          cleaningUntil,
        };
      }
    }

    return {
      roomId: room.id,
      roomName: room.name,
      status: "available",
      source: "auto",
    };
  });
}
