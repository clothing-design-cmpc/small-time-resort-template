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
    "Villa Azure Resort began in 2008 as a single beachfront cottage, built by hand by the founding family who wanted to share their piece of the coastline with travelers looking for quiet, unhurried days by the water. What started as three rooms and a small dining nipa hut has grown, over more than a decade, into the resort you see today — without losing the personal, family-run feel that guests kept coming back for.\n\nEvery villa and suite on the property was designed to feel like a private retreat rather than a hotel room, and every member of our team — from the kitchen to housekeeping to the boat crew — has been with us for years, not months. We believe hospitality is remembered in small details: a name remembered, a favorite table saved, a quiet recommendation for where to watch the sunset. That's the experience we still aim to give every guest who walks through our gate.",
  aboutDifferentiator1Title: "True Privacy",
  aboutDifferentiator1Body:
    "A handful of villas, never a crowd. Every stay is designed around distance from everything else.",
  aboutDifferentiator2Title: "A Quiet Shoreline",
  aboutDifferentiator2Body:
    "No boardwalks, no beach vendors — just open water and the sound of it.",
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
