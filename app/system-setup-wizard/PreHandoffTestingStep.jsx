/**
 * FILE: app/system-setup-wizard/PreHandoffTestingStep.jsx
 * ROLE: Client Component — Step 10 of the setup wizard
 *
 * PURPOSE:
 * Renders once DeploymentStep's "Continue" is clicked (Step 9).
 * LocalDryRunStep (Step 8) already ran this exact same checklist
 * against localhost, before deploying — this step repeats it against
 * the real, live, deployed URL as the final pre-handoff confirmation,
 * since a working localhost pass doesn't guarantee the deployed
 * environment (real domain, production env vars in Vercel, DNS) is
 * also wired correctly. See testingChecklistItems.js for the shared
 * checklist both steps use.
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
import { buildTestingChecklist } from "./testingChecklistItems";

// Each item is something that can ONLY be confirmed by actually using
// the live site — never something an earlier wizard step's API call
// already checked. Grouped so the checklist reads like a real QA pass,
// not a random pile of unrelated checkboxes.
const TESTING_CHECKLIST = buildTestingChecklist("the live URL");

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
      <span className="setupWizardEyebrow">Step 10 of 11</span>
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
