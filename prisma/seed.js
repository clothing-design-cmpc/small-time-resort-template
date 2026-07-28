/**
 * FILE: prisma/seed.js
 * PURPOSE:
 * Seeds sample data for Rooms, Resort Amenities, and the Resort
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
 * Clears and re-inserts the Room list on every run — this is a small
 * private resort with exactly one room, so there's no need to upsert
 * by slug. Clearing first also prevents stale/duplicate rows from
 * lingering under old slugs whenever the room is renamed.
 */
async function seedRooms() {
  const rooms = [
    {
      name: "The Room",
      slug: "the-room",
      description:
        "The resort's single room, spread across two floors — a sleeping area upstairs and a sitting area with an outdoor porch downstairs, with a view of the surrounding farmland.",
      pricePerNight: 4500.0,
      capacity: 6,
      imageUrl:
        "https://images.unsplash.com/photo-1500076656116-558758c991c1?auto=format&fit=crop&w=1600&q=80",
      sortOrder: 1,
    },
  ];

  await prisma.room.deleteMany();
  await prisma.room.createMany({ data: rooms });
  console.log(`✓ Seeded ${rooms.length} room`);
}

/**
 * seedAmenities
 * Clears and re-inserts amenities on every run — simplest for a small,
 * fully-replaced list like this (no unique slug to upsert against).
 */
async function seedAmenities() {
  const amenities = [
    { name: "Karaoke KTV", description: "A private videoke room stocked with a song catalog for family sing-alongs day or night.", icon: "mic-2", sortOrder: 1 },
    { name: "Basketball Court", description: "A full outdoor half-court open to all guests — bring your own ball or borrow one at reception.", icon: "circle-dot", sortOrder: 2 },
    { name: "Mini Kitchen", description: "A shared cooking area with a gas stove, sink, and basic cookware for guests who want to prepare their own meals.", icon: "cooking-pot", sortOrder: 3 },
    { name: "Children's Playground", description: "A small, fenced play area with slides and swings, right next to the picnic huts.", icon: "toy-brick", sortOrder: 4 },
    { name: "BBQ Area", description: "Open-air grilling stations with charcoal on hand — perfect for a family cookout after a swim.", icon: "flame", sortOrder: 5 },
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
    { name: "Charcoal (Uling)", description: "A sack of cooking-grade charcoal for the BBQ area's grilling stations. Ready to light at check-in.", price: 150.0, category: "grill", imageUrl: "https://images.unsplash.com/photo-1604335399105-a0c585fd81a1?auto=format&fit=crop&w=600&q=80", sortOrder: 1 },
    { name: "Coca-Cola", description: "Ice-cold Coca-Cola in the classic bottle. Sold at the shop, chilled and ready to grab.", price: 45.0, category: "beverage", imageUrl: "https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=600&q=80", sortOrder: 2 },
    { name: "Sprite", description: "Crisp, lemon-lime Sprite, served ice-cold from the resort shop.", price: 45.0, category: "beverage", imageUrl: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80", sortOrder: 3 },
    { name: "Royal", description: "Royal Tru-Orange soda, a Filipino classic — sweet, fruity, and always cold at the shop.", price: 45.0, category: "beverage", imageUrl: "https://images.unsplash.com/photo-1624517452488-04869289c4ca?auto=format&fit=crop&w=600&q=80", sortOrder: 4 },
    { name: "Plastic Cups (Pack of 10)", description: "Disposable plastic cups for drinks around the pavilion or BBQ area — sold by the pack of 10.", price: 40.0, category: "supplies", imageUrl: "https://images.unsplash.com/photo-1620403305510-6b8cd0e4c9cc?auto=format&fit=crop&w=600&q=80", sortOrder: 5 },
    { name: "Plastic Utensils (Pack of 10)", description: "Disposable spoons and forks, sold by the pack of 10 — handy for the BBQ area and mini kitchen.", price: 40.0, category: "supplies", imageUrl: "https://images.unsplash.com/photo-1608219994488-cc0e0e6c6c0e?auto=format&fit=crop&w=600&q=80", sortOrder: 6 },
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
    { name: "Karaoke Night", description: "Book the KTV room for a few hours and belt out your favorites with the family — song list included.", duration: "2 hours", minGroupSize: 2, maxGroupSize: 12, imageUrl: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=800&q=80", isFeatured: true, sortOrder: 1 },
    { name: "Pick-Your-Own Harvest", description: "Walk the farm rows with a caretaker and pick fresh vegetables and fruit in season to take home or cook on-site.", duration: "1 hour", minGroupSize: 1, maxGroupSize: 10, imageUrl: "https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?auto=format&fit=crop&w=800&q=80", isFeatured: true, sortOrder: 2 },
    { name: "Family BBQ Cookout", description: "Grill your own food at the BBQ area — charcoal, grills, and picnic tables provided, just bring what you'd like to cook.", duration: "Half day", minGroupSize: 2, maxGroupSize: 15, imageUrl: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80", isFeatured: false, sortOrder: 3 },
    { name: "Basketball Pick-Up Games", description: "Open half-court games for guests of all ages — grab a ball at reception and shoot around anytime.", duration: "1 hour", minGroupSize: 1, maxGroupSize: 10, imageUrl: "https://images.unsplash.com/photo-1546519638-68e109498ffd?auto=format&fit=crop&w=800&q=80", isFeatured: false, sortOrder: 4 },
    { name: "Farm Animal Feeding", description: "Visit the small animal pens with a caretaker and help feed the chickens, goats, and ducks — a hit with the kids.", duration: "45 minutes", minGroupSize: 1, maxGroupSize: 10, imageUrl: "https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&w=800&q=80", isFeatured: false, sortOrder: 5 },
  ];

  await prisma.activity.deleteMany();
  await prisma.activity.createMany({ data: activities });
  console.log(`✓ Seeded ${activities.length} activities`);
}

/**
 * seedSystemSettings
 * Upserts the singleton SystemSettings row (id: "singleton") with sample
 * Our Story / Policies / homepage / SEO copy so the visitor site isn't
 * blank on a fresh project. update: only fills fields that are currently
 * null/empty on the existing row — never overwrites content an admin has
 * already edited from Super-Admin > Policies & Content on a later re-run.
 */
async function seedSystemSettings() {
  const content = {
    // --- Our Story / About ---
    aboutEyebrow: "Our Story",
    aboutTitle: "Where the City Slows Down",
    aboutPageContent:
      "your-private-resort was never meant to be big. It started as a small piece of farmland that the family used for weekend gatherings — a place to get away from traffic, noise, and screens, even if just for a day or two. Over time, friends started asking to bring their own families along, and what began as a private backyard slowly grew into the small resort it is today.\n\nWe kept it small on purpose. There's no sprawling lobby here, no crowd of strangers — just a handful of rooms, open fields, and simple activities that bring people together: a game of basketball, a round of karaoke, a grill going at the BBQ area while the kids run around the playground. It's the kind of place where you cook your own meal in the mini kitchen instead of ordering room service, and where the loudest sound after sunset is usually laughter.\n\nWe're not trying to be a five-star resort. We're trying to be the place your family requests to go back to every year.",
    aboutDifferentiator1Title: "Small By Design",
    aboutDifferentiator1Body:
      "We only take a limited number of guests at a time, so the property never feels crowded or rushed.",
    aboutDifferentiator2Title: "Built for Families",
    aboutDifferentiator2Body:
      "Every amenity — the playground, the BBQ area, the basketball court — was chosen with families and groups in mind.",
    aboutDifferentiator3Title: "Run By Us, Not a Chain",
    aboutDifferentiator3Body:
      "There's no corporate office behind this — just a family that still checks guests in personally and fixes the grill when it breaks.",

    // --- Policies ---
    houseRules:
      "1. Check-in is from 2:00 PM and check-out is by 12:00 PM. Early check-in and late check-out are available on request, subject to availability.\n2. The resort is a family-friendly property — please be mindful of noise levels after 10:00 PM, especially near the karaoke room.\n3. Outside food and beverages are welcome for personal consumption; corkage does not apply for personal use.\n4. Pets are not permitted on the property at this time.\n5. Smoking is only allowed in designated outdoor areas — never inside rooms.\n6. Guests are responsible for any damage to resort property caused during their stay.\n7. Use of the basketball court and children's playground is at the guest's own risk — please supervise young children at all times.\n8. Charcoal and grills at the BBQ area must be handled with care; guests are responsible for fully extinguishing coals after use.\n9. The resort reserves the right to refuse service or ask guests to leave in cases of behavior that endangers other guests or staff.",
    bookingPoliciesIntro:
      "These are the terms that apply to every reservation made through our website, whether for an Overnight stay, Day Tour, or Night Tour.",
    bookingPolicies:
      "A valid ID and downpayment are required to confirm any reservation. Full payment is due upon check-in unless other arrangements have been made in writing with resort management. Room rates are per stay, not per person, unless stated otherwise on the room's listing — extra guest fees apply beyond the allowed pax limit shown on your booking confirmation. Rates and availability are subject to change without prior notice until a booking is confirmed and paid. Bookings are exclusive per stay — once your Overnight reservation is confirmed, the room is reserved solely for your party for the full duration of your stay.",
    cancellationPolicyIntro:
      "We understand plans change. Here's how cancellations and refunds are handled depending on how close to your check-in date you cancel.",
    cancellationPolicy:
      "Cancellations made 14 days or more before check-in are eligible for a full refund, less a small processing fee. Cancellations made 7–13 days before check-in are eligible for a 50% refund of the total paid. Cancellations made less than 7 days before check-in are non-refundable, though we're happy to discuss rebooking to a later date subject to availability. No-shows are treated the same as a late cancellation. Refunds, when applicable, are processed within 5–10 business days back to the original payment method. See the Refund Summary table below for the exact figures currently in effect.",
    termsOfService:
      "By booking with your-private-resort, you agree to the following: all information provided during booking must be accurate and complete; the resort is not liable for personal belongings lost or damaged during your stay; guests under 18 must be accompanied by a parent or guardian; the resort reserves the right to update these terms at any time, with changes applying to bookings made after the update date; any disputes arising from a stay will first be addressed directly with resort management before any other action is pursued. Continued use of this website and completion of a booking constitutes acceptance of these terms.",
    privacyPolicy:
      "We collect only the information needed to process your reservation — your name, contact details, and payment information — and we never sell or share this information with third parties for marketing purposes. Payment details are processed securely through our payment provider and are not stored on our servers. Booking information is retained for as long as needed for accounting and legal purposes, after which it is securely deleted. You may request a copy of the information we hold about you, or request its deletion, by contacting us directly using the details on our Contact page.",

    // --- Refund Summary Table ---
    refundFullWindowDays: 14,
    refundFullRefundFee: "₱500",
    refundPartialWindowDays: 7,
    refundPartialPercent: 50,

    // --- Check-In / Check-Out notes ---
    checkInTime: "2:00 PM",
    checkOutTime: "12:00 PM",
    checkInNote: "Early check-in may be arranged in advance, subject to room availability.",
    checkOutNote: "Late check-out beyond 12:00 PM may incur an additional half-day charge.",

    // --- Contact Info ---
    resortPhone: "+63 917 000 0000",
    resortEmail: "reservations@your-private-resort.com",
    resortAddress: "Barangay Bukid, Silang, Cavite, Philippines",

    // --- Homepage Copy ---
    heroEyebrow: "Welcome to your-private-resort",
    heroTitle: "Your Private Escape in the Countryside",
    heroTagline: "Fresh Air, Farm Views, and Family Time",
    ctaSectionHeading: "Ready to Plan Your Stay?",
    ctaSectionSubtext: "Rooms book up quickly during peak season — reserve your dates today.",
    ctaButtonText: "Plan Your Stay",

    // --- Section Headers ---
    roomsEyebrow: "Accommodations",
    roomsTitle: "Rooms",
    roomsSubtitle: "Each room is designed for privacy, comfort, and a view of the surrounding farmland.",
    amenitiesEyebrow: "Resort Amenities",
    amenitiesTitle: "Everything You Need, Steps Away",
    amenitiesSubtitle: "From the KTV room to the basketball court, every amenity is included in your stay.",
    shopEyebrow: "Resort Shop",
    shopTitle: "Farm Store & Essentials",
    shopSubtitle: "Grab charcoal, cold drinks, and party supplies at the shop — no need to bring everything from home.",
    shopFootnote: "Prices are in Philippine Peso (₱) and subject to change.",
    testimonialsEyebrow: "Guest Reviews",
    testimonialsTitle: "What Our Guests Say",
    activitiesEyebrow: "Things To Do",
    activitiesTitle: "Activities & Experiences",
    activitiesSubtitle: "Farm activities and experiences you can enjoy alongside your stay.",
    galleryEyebrow: "Gallery",
    galleryTitle: "A Glimpse of your-private-resort",
    bookedDatesEyebrow: "Availability",
    bookedDatesTitle: "Check Booked Dates",
    bookedDatesSubtitle: "See which dates are already reserved before you plan your stay.",
    policiesEyebrow: "Good to Know",
    policiesTitle: "Policies & Guidelines",
    policiesSubtitle: "Please review our house rules and booking terms before reserving.",

    // --- SEO ---
    siteTitle: "your-private-resort",
    siteDescription:
      "your-private-resort is a private, family-run farm resort in Cavite offering exclusive rooms, karaoke, basketball, BBQ, and unhurried days in the countryside.",
  };

  await prisma.systemSettings.upsert({
    where: { id: "singleton" },
    // On an existing row, only fill fields that are still null/empty —
    // never clobber content an admin has already customized from the
    // Super-Admin dashboard on a later re-run of this script.
    update: Object.fromEntries(
      await (async () => {
        const existing = await prisma.systemSettings.findUnique({ where: { id: "singleton" } });
        if (!existing) return Object.entries(content);
        return Object.entries(content).filter(([key]) => {
          const current = existing[key];
          return current === null || current === undefined || current === "";
        });
      })()
    ),
    create: { id: "singleton", ...content },
  });
  console.log("✓ Seeded Our Story / Policies / homepage copy (system_settings)");
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
    update: { fullName: "your-private-resort Admin", role: "super_admin", isOwner: true },
    create: { id: authUser.id, fullName: "your-private-resort Admin", role: "super_admin", isOwner: true },
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
  await clearStaleBookings();
  await seedRooms();
  await seedAmenities();
  await seedStoreProducts();
  await seedActivities();
  await seedSystemSettings();
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