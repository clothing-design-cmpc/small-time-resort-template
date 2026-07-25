/**
 * FILE: scripts/backfillBookingRuleDateCount.js
 * PURPOSE:
 * One-time backfill for BookingRule.howManySelectedDates. That column
 * was added as `@default(0)` (prisma/schema.prisma), so any rule set
 * created BEFORE this feature shipped — e.g. "3Ds-2Ns", "4Ds-3Ns" —
 * still has howManySelectedDates stuck at 0 in the database, even
 * though ruleDates itself already has the real dates saved. Nothing
 * re-derives that column automatically; it's only ever set going
 * forward, on the next create/update through the admin form (see
 * app/api/superAdmin/settings/booking-rules/route.js and
 * [ruleId]/route.js). Existing rows need this script run once so the
 * visitor booking flow's date-count matching
 * (services/bookingRules.js -> getActiveBookingRuleForDateCount) can
 * actually find them instead of always falling back to the
 * "most recently updated Active rule" default.
 *
 * SAFE TO RE-RUN: it only ever sets howManySelectedDates to
 * ruleDates.length for the current data — running it twice, or after
 * new rules were added normally through the admin form, does nothing
 * to rows that are already correct.
 *
 * Uses its own standalone PrismaClient (DIRECT_URL) — same reasoning
 * as scripts/checkSetupWizardStatus.js's own header.
 *
 * USAGE: node scripts/backfillBookingRuleDateCount.js
 * (reads DIRECT_URL from .env.local via loadEnv.mjs)
 */
import "./loadEnv.mjs";
import prismaPkg from "@prisma/client";
const { PrismaClient } = prismaPkg;
import { PrismaPg } from "@prisma/adapter-pg";
import { logDbHost } from "./lib/logDbHost.js";

logDbHost("DIRECT_URL", process.env.DIRECT_URL);
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const allRules = await prisma.bookingRule.findMany({
    select: { id: true, name: true, ruleDates: true, howManySelectedDates: true },
  });

  console.log(`\n=== Backfilling howManySelectedDates for ${allRules.length} rule set(s) ===\n`);

  let updatedCount = 0;
  let alreadyCorrectCount = 0;

  for (const rule of allRules) {
    const correctCount = rule.ruleDates.length;

    if (rule.howManySelectedDates === correctCount) {
      console.log(`  - "${rule.name}": already correct (${correctCount}) — skipped`);
      alreadyCorrectCount += 1;
      continue;
    }

    await prisma.bookingRule.update({
      where: { id: rule.id },
      data: { howManySelectedDates: correctCount },
    });
    console.log(`  - "${rule.name}": ${rule.howManySelectedDates} -> ${correctCount}`);
    updatedCount += 1;
  }

  console.log(`\nDone. Updated: ${updatedCount}. Already correct: ${alreadyCorrectCount}.\n`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("[backfillBookingRuleDateCount] Failed:", error.message);
  await prisma.$disconnect();
  process.exit(1);
});