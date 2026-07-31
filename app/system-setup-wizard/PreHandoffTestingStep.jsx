/**
 * FILE: app/system-setup-wizard/PreHandoffTestingStep.jsx
 * ROLE: Client Component — Step 10 of the setup wizard
 *
 * PURPOSE:
 * Renders once VerifyVaultAccessStep's "I've Verified Vault Access" is
 * clicked (Step 8). Steps 1-8 each verify one individual piece
 * (env vars present, DB reachable, admin account exists, vault opens)
 * — none of them actually click through the live site as a real guest
 * or a real super-admin would. This step exists so that verification
 * happens deliberately, once, before anyone hands the site to the
 * owner — not skipped because every earlier step already showed green
 * checkmarks.
 *
 * This is a plain checklist, client-state only — nothing is sent to
 * the server and nothing here is re-checked automatically. Every item
 * must be manually ticked before "Continue to Finalize" unlocks. There
 * is no way to fake-complete this from a stale/cached state: state
 * resets to unchecked on every mount (e.g. reloading this tab starts
 * the checklist over), on purpose — a checklist that silently
 * remembers being checked once already defeats the point of it.
 *
 * DATA FLOW: none. Pure client-side checklist -> hands off to
 * <SetupCompleteStep /> (Step 11) once every item is checked.
 */
"use client";

import { useState } from "react";
import SetupCompleteStep from "./SetupCompleteStep";

// Each item is something that can ONLY be confirmed by actually using
// the live site — never something an earlier wizard step's API call
// already checked. Grouped so the checklist reads like a real QA pass,
// not a random pile of unrelated checkboxes.
const TESTING_CHECKLIST = [
  {
    group: "Visitor site",
    items: [
      "Homepage loads at the live URL and every section renders (Hero, About, Rooms, Amenities, Shop, Activities, Gallery, Testimonials, Location, Contact).",
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
      "Confirm a real EmailJS email actually arrived for at least one flow (booking confirmation, contact form, or the vault OTP from Step 8) — presence in .env.local doesn't guarantee a working template.",
      "Re-open the vault recovery link from Step 8 one more time and confirm it still loads (the URL is hash-derived and changes on rotation — good to double check it wasn't accidentally rotated since).",
    ],
  },
];

export default function PreHandoffTestingStep() {
  const [checkedItems, setCheckedItems] = useState({});
  const [showFinalize, setShowFinalize] = useState(false);

  const allItems = TESTING_CHECKLIST.flatMap((section) => section.items);
  const allChecked = allItems.every((item) => checkedItems[item]);

  function toggleItem(item) {
    setCheckedItems((previous) => ({ ...previous, [item]: !previous[item] }));
  }

  if (showFinalize) {
    return <SetupCompleteStep />;
  }

  return (
    <div className="setupWizardCard">
      <span className="setupWizardEyebrow">Step 9 of 10</span>
      <h1 className="setupWizardTitle">Test the live site before handing it off</h1>
      <p className="setupWizardBody">
        Everything above confirmed individual pieces are configured correctly — it did not
        confirm the site actually works end-to-end. Go through every item below on the real,
        deployed site (not just localhost) before continuing. Check each one off as you verify
        it yourself; nothing here is checked automatically.
      </p>

      {TESTING_CHECKLIST.map((section) => (
        <div key={section.group} className="setupWizardTestingGroup">
          <h2 className="setupWizardTestingGroupTitle">{section.group}</h2>
          {section.items.map((item) => (
            <label key={item} className="setupWizardCheckboxLabel">
              <input type="checkbox" checked={Boolean(checkedItems[item])} onChange={() => toggleItem(item)} />
              {item}
            </label>
          ))}
        </div>
      ))}

      <button
        type="button"
        className="setupWizardButton"
        disabled={!allChecked}
        onClick={() => setShowFinalize(true)}
      >
        {allChecked ? "Continue to Finalize" : `Check all items to continue (${allItems.filter((item) => checkedItems[item]).length}/${allItems.length})`}
      </button>
    </div>
  );
}
