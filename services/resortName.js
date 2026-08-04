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
