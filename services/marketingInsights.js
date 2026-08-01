/**
 * FILE: services/marketingInsights.js
 * PURPOSE:
 * Computes the data behind the Dashboard's "Marketing Insights" section
 * — three things an owner can act on for marketing/sales decisions,
 * built entirely from real Booking records (no new tables needed):
 *   1. Recent Bookings   — latest confirmed bookings, so the owner can
 *                          see fresh activity at a glance.
 *   2. Top Performing Rooms — which rooms/villas bring in the most
 *                          revenue and bookings, current calendar month.
 *   3. Repeat Guest Rate — what share of guests have booked more than
 *                          once, matched by guestEmail (falling back to
 *                          guestPhone when email wasn't provided) —
 *                          signals how well repeat-business/loyalty
 *                          efforts are working.
 *
 * DATA FLOW:
 * 1. app/api/admin/marketing-insights/route.js calls
 *    getMarketingInsights() after requireSuperAdmin() passes
 * 2. All three run as parallel Prisma queries against the Booking table
 * 3. Repeat-guest matching happens in JS after fetch, since Prisma
 *    can't easily express "group by COALESCE(email, phone)" in one query
 */
import { prisma } from "@/services/prisma";

const RECENT_BOOKINGS_LIMIT = 8;
const TOP_ROOMS_LIMIT = 5;

/**
 * getRecentBookings
 * Latest confirmed bookings (any status included so cancellations are
 * visible too — an owner doing marketing review benefits from seeing
 * cancellations, not just confirmed ones), newest first, with the
 * room's name attached for display.
 */
async function getRecentBookings() {
  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    take: RECENT_BOOKINGS_LIMIT,
    include: { room: { select: { name: true } } },
  });

  return bookings.map((booking) => ({
    id: booking.id,
    guestName: booking.guestName,
    roomName: booking.room?.name ?? "Deleted Room",
    checkInDate: booking.checkInDate,
    checkOutDate: booking.checkOutDate,
    totalAmount: Number(booking.totalAmount),
    status: booking.status,
    createdAt: booking.createdAt,
  }));
}

/**
 * getTopPerformingRooms
 * Ranks active rooms by confirmed-booking revenue for the current
 * calendar month — the number an owner needs to decide which
 * rooms/villas to feature in ads or promo bundles.
 *
 * Uses checkInDate (when the stay actually happens), not createdAt
 * (when the booking record was entered). Guests routinely book weeks
 * or months ahead of their stay, so gating on createdAt meant this
 * panel went blank the moment no *new* booking had been created since
 * the 1st of the month — even while rooms were actively occupied and
 * earning revenue this month from bookings made earlier. checkInDate
 * is the correct "is this room performing this month" signal.
 */
async function getTopPerformingRooms() {
  const now = new Date();
  const startOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const grouped = await prisma.booking.groupBy({
    by: ["roomId"],
    where: {
      status: "confirmed",
      checkInDate: { gte: startOfThisMonth, lt: startOfNextMonth },
      roomId: { not: null },
    },
    _sum: { totalAmount: true },
    _count: { id: true },
    orderBy: { _sum: { totalAmount: "desc" } },
    take: TOP_ROOMS_LIMIT,
  });

  if (grouped.length === 0) return [];

  const roomIds = grouped.map((entry) => entry.roomId);
  const rooms = await prisma.room.findMany({
    where: { id: { in: roomIds } },
    select: { id: true, name: true },
  });
  const roomNameById = new Map(rooms.map((room) => [room.id, room.name]));

  return grouped.map((entry) => ({
    roomId: entry.roomId,
    roomName: roomNameById.get(entry.roomId) ?? "Deleted Room",
    bookingCount: entry._count.id,
    revenue: Number(entry._sum.totalAmount ?? 0),
  }));
}

/**
 * getRepeatGuestRate
 * A "guest" is identified by guestEmail when present, otherwise
 * guestPhone — matches how the same person would realistically be
 * recognized across separate booking form submissions (no login
 * account exists for guests in this schema). Returns the count of
 * distinct guests, how many of them have 2+ confirmed bookings, the
 * resulting percentage, AND — for the dashboard's Repeat Guest Rate
 * table (name + total price spent) — the full list of repeat guests
 * themselves, sorted by total spend so the owner sees the highest-value
 * repeat guests first. Pagination (10 per page) is handled client-side
 * in MarketingInsightsClient.jsx since this list is already small.
 */
async function getRepeatGuestRate() {
  const confirmedBookings = await prisma.booking.findMany({
    where: { status: "confirmed" },
    select: { guestName: true, guestEmail: true, guestPhone: true, totalAmount: true },
  });

  // Accumulate per-guest stats (booking count + total spend) keyed by the
  // same email-first, phone-fallback identity used everywhere else in
  // this file, so a guest who booked 3 times is counted once here with
  // their combined total price across all 3 bookings.
  const guestStatsByKey = new Map();
  for (const booking of confirmedBookings) {
    const guestKey = booking.guestEmail?.trim() || booking.guestPhone?.trim();
    if (!guestKey) continue; // no usable identifier — can't attribute to a guest

    const existingStats = guestStatsByKey.get(guestKey);
    if (existingStats) {
      existingStats.bookingCount += 1;
      existingStats.totalAmount += Number(booking.totalAmount);
    } else {
      guestStatsByKey.set(guestKey, {
        guestName: booking.guestName,
        bookingCount: 1,
        totalAmount: Number(booking.totalAmount),
      });
    }
  }

  const totalDistinctGuests = guestStatsByKey.size;

  // Only guests with 2+ confirmed bookings are "repeat guests" — this is
  // the exact list the dashboard table displays (name + total price),
  // highest spender first.
  const repeatGuests = [...guestStatsByKey.entries()]
    .filter(([, stats]) => stats.bookingCount >= 2)
    .map(([guestKey, stats]) => ({
      guestKey,
      guestName: stats.guestName,
      bookingCount: stats.bookingCount,
      totalAmount: stats.totalAmount,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const repeatGuestCount = repeatGuests.length;
  const repeatGuestPercent = totalDistinctGuests === 0 ? 0 : Math.round((repeatGuestCount / totalDistinctGuests) * 100);

  return { totalDistinctGuests, repeatGuestCount, repeatGuestPercent, repeatGuests };
}

/**
 * getMarketingInsights
 * Runs all three computations in parallel and returns them together
 * for the single dashboard API route to serve in one response.
 */
export async function getMarketingInsights() {
  const [recentBookings, topRooms, repeatGuestRate] = await Promise.all([
    getRecentBookings(),
    getTopPerformingRooms(),
    getRepeatGuestRate(),
  ]);

  return { recentBookings, topRooms, repeatGuestRate };
}