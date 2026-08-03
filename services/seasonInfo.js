/**
 * FILE: services/seasonInfo.js
 * PURPOSE:
 * Shared logic for the "what season/event is it right now" concept
 * used in two places: Section 5's Seasonal Pricing info panel
 * (app/superAdmin/(protected)/settings/booking-rules) and the
 * super-admin top bar's Date/Time/Event/Season display
 * (components/superAdmin/AdminHeader.jsx).
 *
 * DEFAULT PHILIPPINE SEASONS:
 * Seeded automatically the first time SeasonDefinition is queried and
 * the table is empty — the typical PH resort pattern: summer +
 * Christmas/New Year as peak, the rainy season as off-season. The
 * admin can edit or delete these afterward; the seed only ever runs
 * once, when the table is genuinely empty, never overwriting edits.
 */
import { prisma } from "@/services/prisma";

export const DEFAULT_SEASON_DEFINITIONS = [
  { seasonType: "peak", label: "Summer Peak", startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 },
  { seasonType: "peak", label: "Holiday Peak (Christmas & New Year)", startMonth: 12, startDay: 16, endMonth: 1, endDay: 15 },
  { seasonType: "off", label: "Rainy / Off-Season", startMonth: 6, startDay: 1, endMonth: 11, endDay: 30 },
];

/**
 * getOrSeedSeasonDefinitions
 * Returns every SeasonDefinition row, seeding the three PH defaults
 * above on first call if the table is empty (get-or-create pattern,
 * same as SystemSettings' singleton upsert elsewhere in this project).
 */
export async function getOrSeedSeasonDefinitions() {
  const existing = await prisma.seasonDefinition.findMany({ orderBy: { startMonth: "asc" } });
  if (existing.length > 0) return existing;

  await prisma.seasonDefinition.createMany({ data: DEFAULT_SEASON_DEFINITIONS });
  return prisma.seasonDefinition.findMany({ orderBy: { startMonth: "asc" } });
}

/**
 * isDateWithinMonthDayRange
 * Checks whether (month, day) falls within a recurring month/day range
 * that may wrap the year boundary (e.g. Dec 16 -> Jan 15). Compares
 * using a sortable "MMDD" number rather than constructing real Date
 * objects, since there's no specific year involved.
 */
function isDateWithinMonthDayRange(month, day, startMonth, startDay, endMonth, endDay) {
  const current = month * 100 + day;
  const start = startMonth * 100 + startDay;
  const end = endMonth * 100 + endDay;

  // Normal range, e.g. Mar 1 -> May 31 (start <= end)
  if (start <= end) {
    return current >= start && current <= end;
  }
  // Wrapped range, e.g. Dec 16 -> Jan 15 (start > end means it crosses Dec 31 -> Jan 1)
  return current >= start || current <= end;
}

/**
 * getCurrentSeason
 * Given the season definitions and a target date (defaults to now, in
 * Asia/Manila), returns the FIRST matching definition, or null if none
 * match (e.g. the admin deleted all defaults and gaps exist). If more
 * than one definition happens to overlap the same day, the earliest
 * startMonth wins — definitions are expected to be seeded/edited to
 * not overlap, but this keeps the result deterministic either way.
 */
export function getCurrentSeason(seasonDefinitions, targetDate = new Date()) {
  const manilaDateString = targetDate.toLocaleString("en-US", { timeZone: "Asia/Manila" });
  const manilaDate = new Date(manilaDateString);
  const month = manilaDate.getMonth() + 1;
  const day = manilaDate.getDate();

  return (
    seasonDefinitions.find((season) =>
      isDateWithinMonthDayRange(month, day, season.startMonth, season.startDay, season.endMonth, season.endDay)
    ) ?? null
  );
}

/**
 * getTodaysEvent
 * Returns a short human label for "what's happening today," checked
 * in this priority order:
 *   1. An active BlackoutDate covering today, for ANY room — its
 *      `reason` field (e.g. "Maintenance," "Private") surfaces as the
 *      event, since a blackout is the most operationally relevant
 *      thing an admin glancing at the top bar would want to know.
 *   2. No active blackout — falls back to simply "Weekday" or
 *      "Weekend" (Asia/Manila) so the top bar always shows something
 *      genuinely useful at a glance instead of an arbitrary rule-set
 *      name that isn't really "today's event."
 */
export async function getTodaysEvent(targetDate = new Date()) {
  const manilaDateString = targetDate.toLocaleString("en-US", { timeZone: "Asia/Manila" });
  const todayManila = new Date(manilaDateString);
  todayManila.setHours(0, 0, 0, 0);

  const activeBlackout = await prisma.blackoutDate.findFirst({
    where: { startDate: { lte: todayManila }, endDate: { gte: todayManila } },
    orderBy: { startDate: "asc" },
  });
  if (activeBlackout) {
    return { label: activeBlackout.reason, type: "blackout" };
  }

  // getDay(): 0 = Sunday, 6 = Saturday — everything else is a weekday.
  const dayOfWeek = todayManila.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  return { label: isWeekend ? "Weekend" : "Weekday", type: "weekday" };
}