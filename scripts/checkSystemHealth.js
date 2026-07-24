/**
 * FILE: scripts/checkSystemHealth.js
 * PURPOSE:
 * On-demand system health check, runnable from a plain terminal with
 * nothing but a working .env — the exact scenario this script exists
 * for is a developer who has ZERO working dashboard access (vault
 * included) but still has the repo. Clone it, fill in .env.local,
 * run this, done.
 *
 * Checks (read-only — never mutates anything):
 *   1. Database connectivity — a bare SELECT 1.
 *   2. Core table reachability — Bookings, Rooms, System Settings.
 *   3. Double-booking detector — two active bookings on the same room
 *      with overlapping [checkInDate, checkOutDate) ranges.
 *
 * *** THIS SCRIPT IS DELIBERATELY NOT PART OF THE LIVE APP. ***
 * Never runs inside a Next.js API route or during a guest's request.
 * The dashboard-wired version of the exact same checks lives at
 * app/api/admin/system-health/route.js -> services/systemHealthCheck.js
 * (used by SystemHealthCheckSection.jsx on the vault dashboard) — this
 * script duplicates that logic locally rather than importing it,
 * because it uses its own standalone PrismaClient (DIRECT_URL, no
 * "@/" alias resolution outside Next.js), same reasoning as
 * scripts/runEnvCheck.js's own header.
 *
 * USAGE: npm run check:health
 * (reads DIRECT_URL from the environment — .env.local covers this for
 * a local run; see prisma.config.mjs for where DIRECT_URL is used
 * elsewhere)
 */
import "./loadEnv.mjs";
import prismaPkg from "@prisma/client";
const { PrismaClient } = prismaPkg;
import { PrismaPg } from "@prisma/adapter-pg";
import { logDbHost } from "./lib/logDbHost.js";

logDbHost("DIRECT_URL", process.env.DIRECT_URL);
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

/**
 * datesOverlap
 * Same overlap rule used everywhere else in this app: checkOutDate
 * itself is not occupied, so a checkout on the 10th and a new
 * check-in on the 10th is NOT a conflict.
 */
function datesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * findDoubleBookings
 * Groups every active (non-cancelled) booking by room, then compares
 * every pair within the same room for an overlapping date range.
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
        const a = roomBookings[i];
        const b = roomBookings[j];
        if (datesOverlap(a.checkInDate, a.checkOutDate, b.checkInDate, b.checkOutDate)) {
          conflicts.push({ room: a.room?.name ?? "Unknown room", a, b });
        }
      }
    }
  }
  return conflicts;
}

async function main() {
  console.log("[checkSystemHealth] Starting system health check…\n");

  let hasProblems = false;

  // --- 1. Connectivity ---
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("[checkSystemHealth] ✓ Database connectivity: OK");
  } catch (error) {
    console.error(`[checkSystemHealth] ✕ Database connectivity: FAILED — ${error.message}`);
    console.error("[checkSystemHealth] Stopping here — the remaining checks all depend on a working connection.");
    process.exitCode = 1;
    return;
  }

  // --- 2. Core tables ---
  const tables = [
    { label: "Bookings", check: () => prisma.booking.count() },
    { label: "Rooms", check: () => prisma.room.count() },
    { label: "System Settings", check: () => prisma.systemSettings.count() },
  ];

  for (const table of tables) {
    try {
      const rowCount = await table.check();
      console.log(`[checkSystemHealth] ✓ ${table.label}: OK (${rowCount} row(s))`);
    } catch (error) {
      console.error(`[checkSystemHealth] ✕ ${table.label}: FAILED — ${error.message}`);
      hasProblems = true;
    }
  }

  // --- 3. Double-booking detector ---
  const conflicts = await findDoubleBookings();
  if (conflicts.length === 0) {
    console.log("[checkSystemHealth] ✓ Double-booking check: no overlapping bookings found");
  } else {
    hasProblems = true;
    console.error(`[checkSystemHealth] ✕ Double-booking check: ${conflicts.length} conflict(s) found`);
    for (const conflict of conflicts) {
      console.error(
        `  - Room "${conflict.room}": "${conflict.a.guestName}" ` +
          `(${conflict.a.checkInDate.toDateString()} – ${conflict.a.checkOutDate.toDateString()}) overlaps with ` +
          `"${conflict.b.guestName}" (${conflict.b.checkInDate.toDateString()} – ${conflict.b.checkOutDate.toDateString()})`
      );
    }
  }

  console.log(`\n[checkSystemHealth] ${hasProblems ? "Finished with problems — see above." : "All checks passed."}`);
  if (hasProblems) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[checkSystemHealth] Unexpected error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
