/**
 * FILE: services/resortName.js
 * PURPOSE:
 * Every guest-facing email subject line ("Booking Request Received",
 * "Booking Confirmed", "Booking Cancelled", etc.) used to hardcode the
 * literal string "your-private-resort" — a rebrand placeholder that
 * was never wired up to SystemSettings.siteTitle, the actual resort
 * name a developer sets once in the setup wizard's Branding step
 * (app/system-setup-wizard/BrandingCard.jsx) or, if skipped there,
 * only from the database directly afterward (Super-Admin > Content >
 * Homepage > Brand Identity renders it read-only — see
 * HomepageSettingsClient.jsx). So changing the branded name during
 * setup silently never touched what guests actually saw in their
 * inbox. This is the single place every email-sending route now reads
 * the resort's display name from, so there's exactly one call site to
 * update if the merge tag ever needs different fallback behavior.
 *
 * Server-side only — never import this in a "use client" file.
 */
import { prisma } from "./prisma.js";

// Same fallback used by the branding routes themselves
// (app/api/system-setup-wizard/branding/route.js,
// app/api/superAdmin/content/homepage/route.js) if the singleton row's
// siteTitle is somehow empty — keeps every reader in agreement.
const DEFAULT_RESORT_NAME = "your-private-resort";

/**
 * getResortDisplayName
 * Returns SystemSettings.siteTitle, or the fallback placeholder if the
 * singleton row hasn't been created/set yet. Cheap, indexed read — the
 * settings row is a singleton, so this is always exactly one query.
 */
export async function getResortDisplayName() {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "singleton" },
    select: { siteTitle: true },
  });
  const trimmedName = settings?.siteTitle?.trim();
  return trimmedName || DEFAULT_RESORT_NAME;
}

/**
 * slugifyResortName
 * Converts a human-typed resort name (e.g. "Victoria's Haven Resort")
 * into the dash-case slug style already used by the placeholder
 * ("your-private-resort") — lowercase, non-alphanumeric runs collapsed
 * to a single dash, no leading/trailing dash.
 */
function slugifyResortName(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * getResortAdminLabel
 * Returns the branded super-admin label — the resort's own display
 * name (or the placeholder fallback) slugified and suffixed with
 * "-admin" (e.g. "victorias-haven-resort-admin"). This is the single
 * source of truth for the super-admin header title and the browser
 * tab title, so a rebrand during setup (or later, via Content >
 * Homepage > Brand Identity) is reflected everywhere the admin area
 * shows its own name, instead of the old hardcoded literal
 * "your-private-resort Admin" string.
 */
export async function getResortAdminLabel() {
  const resortName = await getResortDisplayName();
  return `${slugifyResortName(resortName)}-admin`;
}
