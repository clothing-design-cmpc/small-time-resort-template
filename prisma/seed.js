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
 */
async function seedStoreProducts() {
  const products = [
    { name: "Villa Azure Scented Candle", description: "Coconut and sea-salt scented soy candle, hand-poured on-site.", price: 850.0, category: "home", imageUrl: "https://images.unsplash.com/photo-1602607203414-9d33e00b6da2?auto=format&fit=crop&w=1200&q=80", sortOrder: 1 },
    { name: "Resort Woven Beach Bag", description: "Handwoven rattan beach bag with leather straps.", price: 1450.0, category: "accessories", imageUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1200&q=80", sortOrder: 2 },
    { name: "Signature Sun Oil", description: "Coconut-based sun oil, locally made, SPF-free finishing oil.", price: 620.0, category: "wellness", imageUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=1200&q=80", sortOrder: 3 },
    { name: "Villa Azure Linen Robe", description: "Lightweight linen bathrobe embroidered with the resort crest.", price: 3200.0, category: "apparel", imageUrl: "https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&w=1200&q=80", sortOrder: 4 },
  ];

  await prisma.storeProduct.deleteMany();
  await prisma.storeProduct.createMany({ data: products });
  console.log(`✓ Seeded ${products.length} store products`);
}

/**
 * seedSuperAdmin
 * Creates the super-admin Auth user via the Supabase Admin API if it
 * doesn't already exist, then upserts the matching admin_profiles row.
 * Skips entirely if SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are not set —
 * this keeps the script safe to run before those are configured.
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
    console.log(`- Super-admin auth user already exists: ${email}`);
  }

  await prisma.adminProfile.upsert({
    where: { id: authUser.id },
    update: { fullName: "Villa Azure Admin", role: "super_admin" },
    create: { id: authUser.id, fullName: "Villa Azure Admin", role: "super_admin" },
  });
  console.log(`✓ Linked admin_profiles for ${email}`);
}

async function main() {
  await seedRooms();
  await seedAmenities();
  await seedStoreProducts();
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
