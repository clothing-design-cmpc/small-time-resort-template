/**
 * FILE: app/system-setup-wizard/LocalDryRunStep.jsx
 * ROLE: Client Component — Step 8 of the setup wizard
 *
 * PURPOSE:
 * Renders once VerifyVaultAccessStep's "I've Verified Vault Access" is
 * clicked (Step 7). Everything before this step verified individual
 * pieces (env vars present, DB reachable, admin account exists, vault
 * opens) — none of that actually clicked through the site as a real
 * guest or a real super-admin would. This step runs that full manual
 * pass against localhost, BEFORE DeploymentStep (Step 9) goes live —
 * catching a broken flow here is a local code fix; catching the same
 * thing after deploying means debugging it on a real, possibly
 * already-visible domain. PreHandoffTestingStep (Step 10) repeats this
 * exact same checklist afterward, against the real deployed URL, as
 * the final pre-handoff confirmation — see testingChecklistItems.js
 * for the shared list both steps use.
 *
 * This is a plain checklist, client-state only — nothing is sent to
 * the server and nothing here is re-checked automatically. Every item
 * must be manually ticked before "Continue to Deployment" unlocks.
 * State resets to unchecked on every mount (e.g. reloading this tab
 * starts the checklist over), on purpose — same reasoning
 * PreHandoffTestingStep uses.
 *
 * DATA FLOW: none. Pure client-side checklist -> hands off to
 * <DeploymentStep /> (Step 9) once every item is checked.
 */
"use client";

import { useState } from "react";
import DeploymentStep from "./DeploymentStep";
import { buildTestingChecklist } from "./testingChecklistItems";

const LOCAL_SITE_URL = "http://localhost:3000";
const TESTING_CHECKLIST = buildTestingChecklist(LOCAL_SITE_URL);

export default function LocalDryRunStep() {
  const [checkedItems, setCheckedItems] = useState({});
  const [showDeployment, setShowDeployment] = useState(false);

  const allItems = TESTING_CHECKLIST.flatMap((section) => section.items);
  const allChecked = allItems.every((item) => checkedItems[item]);

  function toggleItem(item) {
    setCheckedItems((previous) => ({ ...previous, [item]: !previous[item] }));
  }

  if (showDeployment) {
    return <DeploymentStep />;
  }

  return (
    <div className="setupWizardCard">
      <span className="setupWizardEyebrow">Step 8 of 11</span>
      <h1 className="setupWizardTitle">Dry-run test on localhost before deploying</h1>
      <p className="setupWizardBody">
        Open the site below in a new tab and click through it end-to-end, the same way a real
        guest and a real super-admin would — nothing this early in the wizard has actually tested
        that yet. Doing this now, before deploying, means anything broken is still a quick local
        fix instead of a live-site debugging session later.
      </p>

      <div className="setupWizardCommandRow">
        <code className="setupWizardCodeBlock">{LOCAL_SITE_URL}</code>
      </div>

      <a
        href={LOCAL_SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="setupWizardButtonSecondary"
      >
        Open Website in New Tab
      </a>

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
        onClick={() => setShowDeployment(true)}
      >
        {allChecked
          ? "Continue to Deployment"
          : `Check all items to continue (${allItems.filter((item) => checkedItems[item]).length}/${allItems.length})`}
      </button>
    </div>
  );
}
