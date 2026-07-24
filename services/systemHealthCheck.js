/**
 * FILE: services/systemHealthCheck.js
 * PURPOSE:
 * Shared "is everything actually working" check, used by BOTH the
 * on-demand vault dashboard card (SystemHealthCheckSection.jsx via
 * app/api/admin/system-health/route.js) and the standalone terminal
 * script (scripts/checkSystemHealth.js) that a developer can run even
 * with zero dashboard access — just .env + `npm run check:health`.
 *
 * Three checks, in order:
 *   1. Database connectivity — a bare SELECT 1 through Prisma.
 *   2. Core table reachability — confirms the tables the app actually
 *      depends on (bookings, rooms, system_settings) can be counted,
 *      catching a broken migration/permissions problem even when the
 *      raw connection itself is fine.
 *   3. Double-booking detector — for every Room, looks for two
 *      non-cancelled Bookings whose [checkInDate, checkOutDate) ranges
 *      overlap. This is the same overlap rule the booking form's own
 *      availability check already enforces at write-time (see
 *      services/bookingRules.js / hooks/useRoomAvailability.js) — this
 *      check exists to catch a conflict that slipped through anyway
 *      (e.g. from a direct DB edit, a race condition, or data
 *      restored from an old backup), not to replace that guard.
 *
 * Never mutates anything — safe to run at any time, as many times as
 * needed, including against a live production database.
 */
import { prisma } from "@/services/prisma";

/**
 * checkDatabaseConnectivity
 * Confirms the app can actually reach Postgres right now, independent
 * of whether any specific table exists yet.
 */
async function checkDatabaseConnectivity() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", message: "Database connection is healthy." };
  } catch (error) {
    return { status: "failed", message: `Connection failed: ${error.message}` };
  }
}

/**
 * checkCoreTables
 * Runs a cheap count() against each table the app can't function
 * without. A thrown error here means the table is missing, the
 * connection lacks permission, or the schema is out of sync with the
 * database — distinct failure modes from "can't connect at all".
 */
async function checkCoreTables() {
  const tables = [
    { label: "Bookings", check: () => prisma.booking.count() },
    { label: "Rooms", check: () => prisma.room.count() },
    { label: "System Settings", check: () => prisma.systemSettings.count() },
  ];

  const results = [];
  for (const table of tables) {
    try {
      const rowCount = await table.check();
      results.push({ label: table.label, status: "ok", rowCount });
    } catch (error) {
      results.push({ label: table.label, status: "failed", message: error.message });
    }
  }
  return results;
}

/**
 * datesOverlap
 * Standard hotel-industry overlap rule: two [checkIn, checkOut) ranges
 * overlap only if one starts before the other ends, in both
 * directions. checkOutDate itself is NOT occupied (same convention
 * used everywhere else in this app — see the Booking model comment in
 * prisma/schema.prisma), so a checkout on the 10th and a new check-in
 * on the 10th is NOT a conflict.
 */
function datesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * findDoubleBookings
 * Groups every non-cancelled Booking by roomId, then compares every
 * pair within the same room for an overlapping date range. Runs
 * entirely in memory after one query — booking volume for a small
 * resort is small enough that this is far simpler (and just as fast)
 * as trying to express the overlap check as a single SQL query.
 */
async function findDoubleBookings() {
  const activeBookings = await prisma.booking.findMany({
    where: { status: { not: "cancelled" }, roomId: { not: null } },
    select: {
      id: true,
      roomId: true,
      guestName: true,
      checkInDate: true,
      checkOutDate: true,
      room: { select: { name: true } },
    },
    orderBy: { checkInDate: "asc" },
  });

  const bookingsByRoom = new Map();
  for (const booking of activeBookings) {
    const existing = bookingsByRoom.get(booking.roomId) ?? [];
    existing.push(booking);
    bookingsByRoom.set(booking.roomId, existing);
  }

  const conflicts = [];
  for (const roomBookings of bookingsByRoom.values()) {
    for (let i = 0; i < roomBookings.length; i++) {
      for (let j = i + 1; j < roomBookings.length; j++) {
        const bookingA = roomBookings[i];
        const bookingB = roomBookings[j];
        if (datesOverlap(bookingA.checkInDate, bookingA.checkOutDate, bookingB.checkInDate, bookingB.checkOutDate)) {
          conflicts.push({
            roomName: bookingA.room?.name ?? "Unknown room",
            bookingAId: bookingA.id,
            bookingAGuest: bookingA.guestName,
            bookingBId: bookingB.id,
            bookingBGuest: bookingB.guestName,
            checkInDateA: bookingA.checkInDate,
            checkOutDateA: bookingA.checkOutDate,
            checkInDateB: bookingB.checkInDate,
            checkOutDateB: bookingB.checkOutDate,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * runSystemHealthCheck
 * Runs all three checks and returns one combined report. Overall
 * status is "ok" only if the connection succeeded, every core table
 * was reachable, AND no double-booking conflicts were found — any
 * single failure is enough to flag the whole report.
 */
export async function runSystemHealthCheck() {
  const connectivity = await checkDatabaseConnectivity();

  // If the connection itself is down, core-table and double-booking
  // checks would just fail with the same underlying error — skip
  // straight to a clear single-cause report instead of three
  // identical-looking failures.
  if (connectivity.status !== "ok") {
    return {
      checkedAt: new Date().toISOString(),
      overallStatus: "failed",
      connectivity,
      coreTables: [],
      doubleBookings: [],
    };
  }

  const coreTables = await checkCoreTables();
  const doubleBookings = await findDoubleBookings();

  const hasTableFailure = coreTables.some((table) => table.status === "failed");
  const overallStatus = hasTableFailure || doubleBookings.length > 0 ? "failed" : "ok";

  return {
    checkedAt: new Date().toISOString(),
    overallStatus,
    connectivity,
    coreTables,
    doubleBookings,
  };
}
