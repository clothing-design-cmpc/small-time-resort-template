/**
 * FILE: scripts/restoreMessageUsChannels.js
 * PURPOSE:
 * One-time restore for SystemSettings.resortWhatsapp / resortViber /
 * resortMessengerUsername. These 3 columns already existed in the live
 * database (confirmed from the 2026-07-29 11:19 UTC backup dump) but
 * were never declared in prisma/schema.prisma — so Prisma Client
 * rejected any select() referencing them with an "Invalid invocation"
 * error, which is what app/visitor/layout.jsx's getMessageUsChannels()
 * was hitting. Adding the fields to schema.prisma + running
 * `npx prisma db push` fixes the schema drift going forward, but does
 * NOT by itself restore the row's actual values if they were ever
 * cleared — this script re-applies the exact values captured in that
 * same backup so the Message Us widget (WhatsApp/Viber/Messenger)
 * works again immediately.
 *
 * SAFE TO RE-RUN: it only ever sets these 3 fields on the singleton
 * row to the fixed values below — running it twice does nothing extra.
 *
 * Uses its own standalone PrismaClient (DIRECT_URL) — same reasoning
 * as scripts/backfillBookingRuleDateCount.js's own header.
 *
 * USAGE: node scripts/restoreMessageUsChannels.js
 * (reads DIRECT_URL from .env.local via loadEnv.mjs)
 *
 * PREREQUISITE: run this AFTER `npx prisma db push` + `npx prisma generate`
 * (see Rule 37.2) — otherwise Prisma Client still won't recognize
 * these 3 fields and this script itself will fail the same way.
 */
import "./loadEnv.mjs";
import prismaPkg from "@prisma/client";
const { PrismaClient } = prismaPkg;
import { PrismaPg } from "@prisma/adapter-pg";
import { logDbHost } from "./lib/logDbHost.js";

logDbHost("DIRECT_URL", process.env.DIRECT_URL);
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

// Values recovered from backups_villa-azure-backup-2026-07-29T11-19-21_sql.gz
const RESTORED_VALUES = {
  resortWhatsapp: "09668829302",
  resortViber: "09668829302",
  resortMessengerUsername: "https://www.facebook.com/p/Victorias-Haven-61574857113365/",
};

async function main() {
  console.log("\n=== Restoring Message Us channels on SystemSettings (singleton) ===\n");

  const updated = await prisma.systemSettings.update({
    where: { id: "singleton" },
    data: RESTORED_VALUES,
    select: { resortWhatsapp: true, resortViber: true, resortMessengerUsername: true },
  });

  console.log(`  - resortWhatsapp: ${updated.resortWhatsapp}`);
  console.log(`  - resortViber: ${updated.resortViber}`);
  console.log(`  - resortMessengerUsername: ${updated.resortMessengerUsername}`);
  console.log("\nDone.\n");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("[restoreMessageUsChannels] Failed:", error.message);
  await prisma.$disconnect();
  process.exit(1);
});
