/**
 * FILE: scripts/createGatekeeper3TestAdmin.mjs
 * PURPOSE:
 * One-time setup for the GATEKEEPER3_TEST_ADMIN_EMAIL /
 * GATEKEEPER3_TEST_ADMIN_PASSWORD account that services/
 * gatekeeper3Tester.js logs into twice to trip Gatekeeper 3. Creates
 * (or re-syncs the password of) a Supabase Auth user and links a
 * matching AdminProfile row — same pattern prisma/seed.js already
 * uses for the real owner account, EXCEPT this one is always created
 * with isOwner: false. This must never be the same account as
 * SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD — running the GK3 test rotates
 * the vault passphrase and blocks the test IP, disruptive enough that
 * it should never touch a real person's daily-use login.
 *
 * USAGE:
 *   node scripts/createGatekeeper3TestAdmin.mjs
 *   (reads GATEKEEPER3_TEST_ADMIN_EMAIL / GATEKEEPER3_TEST_ADMIN_PASSWORD
 *   from .env.local — set both there first, see the printed values
 *   below if you don't have them yet)
 *
 * Safe to re-run — idempotent, same as prisma/seed.js's seedSuperAdmin().
 */
import "./loadEnv.mjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

// Server-side only — bypasses RLS and can manage Auth users. Never
// expose SUPABASE_SERVICE_ROLE_KEY to the client.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const email = process.env.GATEKEEPER3_TEST_ADMIN_EMAIL;
  const password = process.env.GATEKEEPER3_TEST_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      "Set GATEKEEPER3_TEST_ADMIN_EMAIL and GATEKEEPER3_TEST_ADMIN_PASSWORD in .env.local first, then re-run this script."
    );
    process.exit(1);
  }

  // Refuse to run against the real owner account — the whole point of
  // a dedicated QA account is that it's never the person's daily login.
  if (email === process.env.SEED_ADMIN_EMAIL) {
    console.error(
      "GATEKEEPER3_TEST_ADMIN_EMAIL must not be the same as SEED_ADMIN_EMAIL — use a separate, dedicated QA account."
    );
    process.exit(1);
  }

  const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) throw listError;

  let authUser = existingUsers.users.find((user) => user.email === email);

  if (!authUser) {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Skip email verification for this QA-only account
    });
    if (createError) throw createError;
    authUser = created.user;
    console.log(`✓ Created GK3 QA admin auth user: ${email}`);
  } else {
    // Re-sync the password every run, same reasoning as
    // prisma/seed.js's seedSuperAdmin() — changing the password in
    // .env.local and re-running this should always take effect.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
    });
    if (updateError) throw updateError;
    console.log(`✓ GK3 QA admin auth user already existed — password re-synced: ${email}`);
  }

  await prisma.adminProfile.upsert({
    where: { id: authUser.id },
    // isOwner: false, always — this is a disposable QA account for
    // tripping Gatekeeper 3 on purpose, never the resort owner.
    update: { fullName: "Gatekeeper 3 QA Test Account", role: "super_admin", isOwner: false },
    create: { id: authUser.id, fullName: "Gatekeeper 3 QA Test Account", role: "super_admin", isOwner: false },
  });
  console.log(`✓ Linked admin_profiles for ${email} (isOwner: false)`);
  console.log("\nDone. This account is only ever used by the Gatekeeper 3 Live Test card in the vault.");
}

main()
  .catch((error) => {
    console.error("Failed to create GK3 QA admin account:", error.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
