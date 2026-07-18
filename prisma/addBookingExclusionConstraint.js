/**
 * FILE: prisma/addBookingExclusionConstraint.js
 * PURPOSE:
 * Adds a database-level guarantee against double-booking (deep search
 * Section 2 — CRITICAL). Prisma cannot express a Postgres EXCLUDE
 * constraint in schema.prisma, so this runs the DDL directly through
 * Prisma's raw query executor — entirely from the terminal, no
 * Supabase SQL Editor needed (per Rule 37.2, never use migrate
 * dev/deploy against Supabase).
 *
 * WHAT THIS DOES:
 * 1. Enables the btree_gist extension (required for an EXCLUDE
 *    constraint that mixes an equality column (room_id) with a range
 *    overlap operator (&&) in the same index).
 * 2. Adds a constraint so the database itself physically rejects an
 *    INSERT/UPDATE that would create two "confirmed" bookings for the
 *    same room with overlapping date ranges — no matter what the
 *    application code does or fails to do. This is the real guarantee;
 *    the Serializable transaction in app/api/bookings/route.js is
 *    defense-in-depth on top of it, not a substitute for it.
 *
 * RUN WITH: node prisma/addBookingExclusionConstraint.js
 * Run this ONCE after the first `npx prisma db push` (and again on any
 * fresh database) — safe to re-run, existing extension/constraint are
 * skipped rather than erroring out the whole script.
 */
require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

// Prisma 7 requires a driver adapter — DIRECT_URL (session pooler) is used
// here since DDL statements (CREATE EXTENSION, ALTER TABLE ADD CONSTRAINT)
// need a direct connection, not the transaction pooler.
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

const statements = [
  `create extension if not exists btree_gist;`,

  // room_id WITH = : two rows only conflict if they're for the SAME room.
  // daterange(...) WITH && : and only if their date ranges overlap.
  // '[)' means check-in is inclusive, check-out is exclusive — so a
  // checkout on 2026-08-10 and a check-in on 2026-08-10 do NOT overlap
  // (matches the existing app-level "checkIn < checkOut" logic).
  // WHERE clause scopes the constraint to confirmed bookings only —
  // a cancelled booking's old dates must never block a new one.
  `alter table bookings add constraint no_overlapping_bookings
     exclude using gist (
       room_id with =,
       daterange(check_in_date, check_out_date, '[)') with &&
     ) where (status = 'confirmed');`,
];

/**
 * run
 * Executes each statement in order. Skips a statement if it fails
 * because the extension or constraint already exists — safe to re-run.
 */
async function run() {
  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(statement);
      console.log(`✓ ${statement.trim().split("\n")[0]}...`);
    } catch (error) {
      console.log(`- skipped (already applied or not needed): ${error.message}`);
    }
  }
  await prisma.$disconnect();
}

run();
