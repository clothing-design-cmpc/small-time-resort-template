/**
 * FILE: prisma/seed.js
 * PURPOSE:
 * Seeds sample data for Rooms & Villas, Resort Amenities, and the Resort
 * Shop. Also creates (or finds) the super-admin Auth user via the
 * Supabase Admin API and links it to admin_profiles.
 *
 * RUN WITH: npx prisma db seed
 * (registered under "prisma.seed" in package.json)
 *
 * Required env vars (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — for creating the admin Auth user
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD                — credentials for the super-admin account
 */
require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { createClient } = require("@supabase/supabase-js");

// Prisma 7 requires a driver adapter — DIRECT_URL (session pooler) is used
// here since this is a one-off administrative script, not high-frequency
// app traffic.
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

// Server-side only — bypasses RLS and can manage Auth users. Never expose
// SUPABASE_SERVICE_ROLE_KEY to the client.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * seedRooms
 * Upserts sample Rooms & Villas by slug so this script is safe to re-run.
 */
async function seedRooms() {
  const rooms = [
    {
      name: "Ocean View Villa",
      slug: "ocean-view-villa",
      description:
        "A private villa with an infinity pool overlooking the bay, floor-to-ceiling windows, and a king-size bed.",
      pricePerNight: 18500.0,
      capacity: 2,
      imageUrl:
        "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1600&q=80",
      sortOrder: 1,
    },
    {
      name: "Garden Suite",
      slug: "garden-suite",
      description:
        "A quiet suite surrounded by tropical gardens, with an outdoor rain shower and a private lanai.",
      pricePerNight: 9800.0,
      capacity: 2,
      imageUrl:
        "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1600&q=80",
      sortOrder: 2,
    },
    {
      name: "Family Beach House",
      slug: "family-beach-house",
      description:
        "A two-bedroom beachfront house with a full kitchen, living area, and direct beach access — ideal for families.",
      pricePerNight: 26500.0,
      capacity: 6,
      imageUrl:
        "https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?auto=format&fit=crop&w=1600&q=80",
      sortOrder: 3,
    },
  ];

  for (const room of rooms) {
    await prisma.room.upsert({
      where: { slug: room.slug },
      update: room,
      create: room,
    });
  }
  console.log(`✓ Seeded ${rooms.length} rooms`);
}

/**
 * seedAmenities
 * Clears and re-inserts amenities on every run — simplest for a small,
 * fully-replaced list like this (no unique slug to upsert against).
 */
async function seedAmenities() {
  const amenities = [
    { name: "Infinity Pool", description: "Adults-only infinity pool overlooking the ocean, open until 10pm.", icon: "waves", sortOrder: 1 },
    { name: "Spa Cabana", description: "Private open-air cabanas for massages and treatments.", icon: "flower-2", sortOrder: 2 },
    { name: "Beachfront Dining", description: "Fresh seafood and local dishes served steps from the shoreline.", icon: "utensils", sortOrder: 3 },
    { name: "Water Sports Center", description: "Kayaks, paddleboards, and snorkeling gear available daily.", icon: "anchor", sortOrder: 4 },
    { name: "Fitness Pavilion", description: "Open-air gym with ocean views, open 24 hours.", icon: "dumbbell", sortOrder: 5 },
    { name: "Kids Club", description: "Supervised activities for children ages 4–12, daily 9am–5pm.", icon: "toy-brick", sortOrder: 6 },
  ];

  await prisma.amenity.deleteMany();
  await prisma.amenity.createMany({ data: amenities });
  console.log(`✓ Seeded ${amenities.length} amenities`);
}

/**
 * seedStoreProducts
 * Clears and re-inserts the Resort Shop's browse-only product list.
 *
 * This list must always mirror components/sections/MiniStoreSection.jsx
 * exactly (name, description, price, category as badge, image) — that
 * component is still rendering its own static PRODUCTS array, but once
 * it's wired to fetch from the DB, these rows are what visitors will see.
 * Previously this seeded unrelated merchandise (candles, beach bags) that
 * had nothing to do with the bar drinks actually shown on the homepage.
 */
async function seedStoreProducts() {
  const products = [
    { name: "Craft Pale Ale", description: "A local Philippine craft ale brewed with Benguet hops. Light, citrusy, and cold — best enjoyed poolside or at the gazebo bar after sunset.", price: 180.0, category: "beverage", imageUrl: "https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&w=600&q=80", sortOrder: 1 },
    { name: "House Red Wine", description: "A smooth Chilean Merlot selected by the resort as its house pour. Pairs with the villa's evening charcuterie set. Available by the glass or bottle.", price: 320.0, category: "beverage", imageUrl: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=600&q=80", sortOrder: 2 },
    { name: "Premium Rum", description: "Aged dark rum from Negros Occidental, straight or over ice. The bar also mixes it into the resort's signature mojito with fresh mint from the garden.", price: 280.0, category: "beverage", imageUrl: "https://images.unsplash.com/photo-1569529465841-dfecdab7503b?auto=format&fit=crop&w=600&q=80", sortOrder: 3 },
    { name: "Fresh Buko Juice", description: "Young coconut water served straight from the shell, chilled and cut to order. Naturally sweet, no added sugar. Sourced daily from the resort's own coconut grove.", price: 120.0, category: "beverage", imageUrl: "https://images.unsplash.com/photo-1758186989205-20afdf8d2665?auto=format&fit=crop&w=600&q=80", sortOrder: 4 },
    { name: "Sparkling Water", description: "San Pellegrino sparkling mineral water, 750ml. Cold, clean, and fizzy. Available at reception anytime or delivered to the villa on request.", price: 95.0, category: "beverage", imageUrl: "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=600&q=80", sortOrder: 5 },
    { name: "Mango Soda", description: "Local canned mango soda made from Philippine carabao mangoes. Bright, sweet, and nostalgic. A resort favorite with kids and adults alike.", price: 80.0, category: "beverage", imageUrl: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80", sortOrder: 6 },
  ];

  await prisma.storeProduct.deleteMany();
  await prisma.storeProduct.createMany({ data: products });
  console.log(`✓ Seeded ${products.length} store products`);
}

/**
 * seedActivities
 * Clears and re-inserts sample resort activities/experiences so the
 * Activities Management admin page (and the visitor site, once wired
 * to it) isn't empty on a fresh project.
 */
async function seedActivities() {
  const activities = [
    { name: "Sunset Catamaran Sail", description: "A guided two-hour sail along the coastline as the sun goes down, with light snacks and drinks included.", duration: "2 hours", minGroupSize: 2, maxGroupSize: 12, imageUrl: "https://images.unsplash.com/photo-1500627964684-141351970a7f?auto=format&fit=crop&w=800&q=80", isFeatured: true, sortOrder: 1 },
    { name: "Guided Snorkeling Tour", description: "Explore the resort's house reef with a certified guide, gear included. Great for beginners and experienced snorkelers alike.", duration: "1.5 hours", minGroupSize: 1, maxGroupSize: 8, imageUrl: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=80", isFeatured: true, sortOrder: 2 },
    { name: "Island Hopping Day Trip", description: "Visit three nearby islands by outrigger boat, with a beach lunch stop. Departs from the resort's private dock.", duration: "Full day", minGroupSize: 2, maxGroupSize: 15, imageUrl: "https://images.unsplash.com/photo-1544644181-1484b3fdfc32?auto=format&fit=crop&w=800&q=80", isFeatured: false, sortOrder: 3 },
    { name: "Sunrise Yoga on the Beach", description: "A gentle, all-levels yoga session on the sand as the sun rises over the water. Mats provided.", duration: "1 hour", minGroupSize: 1, maxGroupSize: 20, imageUrl: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80", isFeatured: false, sortOrder: 4 },
    { name: "Kayak & Mangrove Tour", description: "Paddle through the calm mangrove channels behind the resort with a local guide pointing out native wildlife.", duration: "2 hours", minGroupSize: 1, maxGroupSize: 6, imageUrl: "https://images.unsplash.com/photo-1502680390469-be75c86b636f?auto=format&fit=crop&w=800&q=80", isFeatured: false, sortOrder: 5 },
  ];

  await prisma.activity.deleteMany();
  await prisma.activity.createMany({ data: activities });
  console.log(`✓ Seeded ${activities.length} activities`);
}

/**
 * seedSuperAdmin
 * Creates the super-admin Auth user via the Supabase Admin API if it
 * doesn't already exist. If it already exists, its password and email
 * confirmation are reset to match SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 * every time this runs — otherwise a stale password from an earlier seed
 * (or one created manually in the Supabase dashboard) would silently
 * never match what's in .env.local, and login would fail with
 * "Invalid login credentials" for no visible reason. Skips entirely if
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are not set — this keeps the
 * script safe to run before those are configured.
 */
async function seedSuperAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("- Skipped super-admin seed: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env.local first.");
    return;
  }

  // Look for an existing Auth user with this email before creating a new one
  const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) throw listError;

  let authUser = existingUsers.users.find((user) => user.email === email);

  if (!authUser) {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Skip email verification for the seeded admin account
    });
    if (createError) throw createError;
    authUser = created.user;
    console.log(`✓ Created super-admin auth user: ${email}`);
  } else {
    // Re-sync the password every run — this is what makes the seed script
    // idempotent for auth, not just for the admin_profiles row. Without
    // this, changing SEED_ADMIN_PASSWORD in .env.local and re-seeding
    // would do nothing, and the login form would keep failing silently.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
    });
    if (updateError) throw updateError;
    console.log(`✓ Super-admin auth user already existed — password re-synced: ${email}`);
  }

  await prisma.adminProfile.upsert({
    where: { id: authUser.id },
    // isOwner: true — this seed script only ever creates ONE admin
    // account (from SEED_ADMIN_EMAIL), so it's always the real owner.
    // Any additional staff accounts created later (outside this
    // script) should be left at the isOwner default (false).
    update: { fullName: "Villa Azure Admin", role: "super_admin", isOwner: true },
    create: { id: authUser.id, fullName: "Villa Azure Admin", role: "super_admin", isOwner: true },
  });
  console.log(`✓ Linked admin_profiles for ${email}`);
}

/**
 * clearStaleBookings
 * Wipes every row in the Booking table. Bookings are guest-submitted
 * data, not seed data, so they are never re-created here — this only
 * clears out leftover rows from an earlier version of this script that
 * used to seed fake bookings (seedBookings was removed, but the rows it
 * had already written stayed in the DB forever since nothing deleted
 * them on later runs). Safe to re-run: after the first pass there is
 * nothing left to delete unless new (real) bookings come in.
 */
async function clearStaleBookings() {
  const { count } = await prisma.booking.deleteMany();
  console.log(`✓ Cleared ${count} booking record(s)`);
}

async function main() {
  await seedRooms();
  await seedAmenities();
  await seedStoreProducts();
  await seedActivities();
  await clearStaleBookings();
  await seedSuperAdmin();
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });