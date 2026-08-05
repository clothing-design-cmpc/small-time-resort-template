/**
 * FILE: app/system-setup-wizard/testingChecklistItems.js
 * PURPOSE:
 * Single source of truth for the "click through the real site as a
 * real guest/admin would" checklist, shared by two wizard steps that
 * run the exact same QA pass against two different URLs:
 *   1. LocalDryRunStep.jsx (Step 8) — runs it against localhost,
 *      BEFORE deploying, so problems are caught while they're still
 *      cheap to fix.
 *   2. PreHandoffTestingStep.jsx (Step 10) — runs it again against the
 *      real deployed URL, AFTER DeploymentStep (Step 9), as the final
 *      pre-handoff confirmation.
 * Previously this list only existed once, inline in
 * PreHandoffTestingStep.jsx. Extracted here so adding/editing an item
 * only has to happen in one place — a step-specific site label is the
 * only thing that changes between the two callers.
 *
 * @param {string} siteLabel - what to call the site being tested in
 *   the first checklist item, e.g. "http://localhost:3000" or
 *   "the live URL".
 */
export function buildTestingChecklist(siteLabel) {
  return [
    {
      group: "Visitor site",
      items: [
        `Homepage loads at ${siteLabel} and every section renders (Hero, About, Rooms, Amenities, Shop, Activities, Gallery, Testimonials, Location, Contact).`,
        "Reserve Your Villa: pick a room and date range, submit a real test booking, and confirm it appears on the admin Bookings page.",
        "Cancel that same test booking from the admin Bookings page and confirm the date opens back up on the visitor date picker.",
      ],
    },
    {
      group: "Super-admin login & account",
      items: [
        "Log out completely, then log back in at /superAdmin/login with the real SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD — not just relying on the session from Step 3.",
        "Try one wrong password on purpose and confirm the error message is generic (\"Invalid email or password\") — see docs/gatekeeper-testing.md before doing this more than once, since repeated attempts trip Gatekeeper 1.",
      ],
    },
    {
      group: "Content management",
      items: [
        "Add or edit a Room, Amenity, and Store Product from the super-admin dashboard and confirm each change shows up on the visitor site.",
        "Edit at least one Policies & Content field (e.g. check-in time or a homepage heading) and confirm it reflects on the visitor site.",
        "Upload one image (room photo or gallery photo) and confirm it renders — this is the easiest way to catch a misconfigured Cloudflare R2 setup.",
      ],
    },
    {
      group: "Alerts & recovery",
      items: [
        "Confirm a real EmailJS email actually arrived for at least one flow (booking confirmation, contact form, or the vault OTP from Step 7) — presence in .env.local doesn't guarantee a working template.",
        "Re-open the vault recovery link from Step 7 one more time and confirm it still loads (the URL is hash-derived and changes on rotation — good to double check it wasn't accidentally rotated since).",
      ],
    },
  ];
}
