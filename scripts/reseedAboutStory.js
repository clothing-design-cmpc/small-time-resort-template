/**
 * FILE: scripts/reseedAboutStory.js
 * PURPOSE:
 * One-off script that force-overwrites the "Our Story" (About section)
 * fields on the singleton SystemSettings row with real content — unlike
 * prisma/seed.js's seedSystemSettings(), which only fills fields that
 * are still null/empty, this script always overwrites the About fields
 * specifically. Use this when those fields already contain test/
 * placeholder values (e.g. "trial", "section 1") typed in while trying
 * out the Super-Admin > Content > Homepage form, and a normal re-seed
 * won't touch them because they're no longer empty.
 *
 * RUN WITH: node scripts/reseedAboutStory.js
 *
 * Required env vars (in .env.local): DIRECT_URL
 */
require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

// Same driver-adapter pattern as prisma/seed.js — DIRECT_URL (session
// pooler) since this is a one-off administrative script.
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

const aboutContent = {
  aboutEyebrow: "Our Story",
  aboutTitle: "A Retreat, Not a Resort",
  aboutPageContent:
    "your-private-resort began as a single room on a quiet piece of farmland in the province. What started as one family's private escape has grown, slowly and deliberately, into the small resort you see today — never more than the land and the quiet can hold. We built it for people who want distance from the city, not another itinerary to keep.",
  aboutDifferentiator1Title: "True Privacy",
  aboutDifferentiator1Body:
    "Just one room, never a crowd. The whole stay is designed around distance from everything else.",
  aboutDifferentiator2Title: "A Quiet Countryside Escape",
  aboutDifferentiator2Body:
    "No traffic, no crowds — just open fields, fresh air, and the sound of it.",
  aboutDifferentiator3Title: "Personal Attention",
  aboutDifferentiator3Body:
    "A small, attentive team who knows every guest by name, not by room number.",
};

async function main() {
  await prisma.systemSettings.upsert({
    where: { id: "singleton" },
    update: aboutContent,
    create: { id: "singleton", ...aboutContent },
  });
  console.log("✓ Reseeded Our Story (About section) — placeholder test values overwritten with real copy.");
}

main()
  .catch((error) => {
    console.error("Reseed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
