/**
 * FILE: prisma/enableRls.js
 * PURPOSE:
 * Enables Row Level Security and adds public-read policies on the
 * resort tables. Prisma does not manage RLS policies natively, so this
 * runs the necessary statements directly through Prisma's raw query
 * executor — entirely from the terminal, no Supabase SQL Editor needed.
 *
 * RUN WITH: node prisma/enableRls.js
 * Run this ONCE after the first `npx prisma db push`.
 */
require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

// Prisma 7 requires a driver adapter — DIRECT_URL (session pooler) is used
// here since DDL statements (ALTER TABLE, CREATE POLICY) need a direct
// connection, not the transaction pooler.
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

/**
 * statements
 * Each entry enables RLS on a table and adds the read policy it needs.
 * "if not exists" isn't supported for CREATE POLICY, so failures on
 * re-run (policy already exists) are caught and skipped further down.
 */
const statements = [
  `alter table rooms enable row level security;`,
  `create policy "Public can view active rooms" on rooms for select using (is_active = true);`,

  `alter table amenities enable row level security;`,
  `create policy "Public can view active amenities" on amenities for select using (is_active = true);`,

  `alter table store_products enable row level security;`,
  `create policy "Public can view active store products" on store_products for select using (is_active = true);`,

  `alter table admin_profiles enable row level security;`,
  `create policy "Admins can view own profile" on admin_profiles for select using (auth.uid() = id);`,
];

/**
 * run
 * Executes each RLS/policy statement in order. Skips a statement if it
 * fails because the policy already exists (safe to re-run this script).
 */
async function run() {
  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(statement);
      console.log(`✓ ${statement}`);
    } catch (error) {
      // Policy or RLS already applied — safe to ignore and continue
      console.log(`- skipped (already applied): ${statement}`);
    }
  }
  await prisma.$disconnect();
}

run();
