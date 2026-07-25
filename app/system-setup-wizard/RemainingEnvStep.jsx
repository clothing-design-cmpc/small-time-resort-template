/**
 * FILE: app/system-setup-wizard/RemainingEnvStep.jsx
 * ROLE: Client Component — Step 5 of the setup wizard
 *
 * PURPOSE:
 * Renders once AdminSetupStep confirms Step 4 (super-admin created).
 * Presence-only checklist for the 9 envGroups.mjs groups not already
 * covered by Step 2 (database, supabase): r2, googleDrive, emailjs,
 * githubActions, rateLimit, geoip, vaultSecurity,
 * aiInsightAndDirections, siteConfig. Together with Step 2, every one
 * of the 11 envGroups.mjs groups is surfaced somewhere in the wizard.
 *
 * Unlike Step 2's per-key "how do I get this" instructions (only 2-3
 * keys per group there), each group here can have 4-9 keys, so this
 * step shows one concise fix instruction per GROUP instead — reusing
 * ENV_FIX_INSTRUCTIONS from scripts/lib/envGroups.mjs (the same text
 * the nightly env-check alert email already uses) rather than
 * duplicating per-key copy a second time.
 *
 * This step has no sequential locking and no "I ran this" checkbox —
 * unlike Step 3's database commands, there's nothing to run in order
 * here, just external dashboard values to paste in. The person can set
 * these in any order, over multiple sessions if needed, since none of
 * them block each other.
 *
 * DATA FLOW:
 * 1. On mount and on every "Check again" click -> GET
 *    /api/system-setup-wizard/remaining-env-status
 * 2. Response drives the ✓/✕ badge per key, grouped by envGroups.mjs
 *    group id
 * 3. "Continue" is always available (these are external services, not
 *    build-blocking database steps) — hands off to Step 6, which is
 *    built incrementally, same placeholder pattern DatabaseSetupStep.jsx
 *    and AdminSetupStep.jsx used before their next step existed
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { ENV_FIX_INSTRUCTIONS } from "@/scripts/lib/envGroups.mjs";

export default function RemainingEnvStep() {
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [openHelpGroupId, setOpenHelpGroupId] = useState(null);
  const [continued, setContinued] = useState(false);

  /**
   * fetchStatus
   * Pulls presence-only status for the 9 remaining envGroups.mjs
   * groups. Never throws to the caller — failures surface as a
   * user-facing error message instead.
   */
  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/system-setup-wizard/remaining-env-status");
      const result = await response.json();

      if (!response.ok || !result.success) {
        setLoadError(result.message ?? "We couldn't check the environment status. Please try again.");
        return;
      }
      setStatus(result.data);
    } catch {
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  function handleCheckAgain() {
    fetchStatus();
  }

  if (isLoading && !status) {
    return (
      <div className="setupWizardCard" role="status">
        <span className="setupWizardEyebrow">Step 5 of 10</span>
        <h1 className="setupWizardTitle">Checking environment status…</h1>
      </div>
    );
  }

  if (loadError && !status) {
    return (
      <div className="setupWizardCard" role="alert">
        <span className="setupWizardEyebrow">Step 5 of 10</span>
        <h1 className="setupWizardTitle">Couldn&apos;t load environment status</h1>
        <p className="setupWizardError">{loadError}</p>
        <button type="button" className="setupWizardButton" onClick={handleCheckAgain}>
          Try again
        </button>
      </div>
    );
  }

  if (continued) {
    return (
      <div className="setupWizardCard" role="status">
        <span className="setupWizardEyebrow">Step 5 of 10 — complete</span>
        <h1 className="setupWizardTitle">Remaining services on file</h1>
        <p className="setupWizardBody">
          The next step (scripts &amp; health checks) is being built
          incrementally — this session stays active for 30 minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="setupWizardStepGroup">
      <div className="setupWizardCard">
        <span className="setupWizardEyebrow">Step 5 of 10</span>
        <h1 className="setupWizardTitle">Remaining services</h1>
        <p className="setupWizardBody">
          Set these in <code>.env.local</code> (and your deployment
          platform&apos;s own environment variables for production) as you
          get to each one. None of these block each other — set them in
          any order, over as many sessions as you need.
        </p>

        {status.envStatus.groups.map((group) => (
          <div key={group.id} className="setupWizardEnvGroup">
            <span className="setupWizardEnvGroupLabel">{group.label}</span>
            <ul className="setupWizardEnvList">
              {group.items.map((item) => (
                <li key={item.key} className="setupWizardEnvItem">
                  <div className="setupWizardEnvItemHeader">
                    <span
                      className={`setupWizardStatusBadge ${
                        item.present ? "setupWizardStatusBadge--ok" : "setupWizardStatusBadge--missing"
                      }`}
                    >
                      {item.present ? "✓ Set" : item.required ? "✕ Missing" : "○ Optional"}
                    </span>
                    <code>{item.key}</code>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="setupWizardHelpToggle"
              onClick={() => setOpenHelpGroupId(openHelpGroupId === group.id ? null : group.id)}
            >
              {openHelpGroupId === group.id ? "Hide" : "How do I get these?"}
            </button>
            {openHelpGroupId === group.id && (
              <div className="setupWizardInstructions">
                <span className="setupWizardInstructionsLabel">{group.label}</span>
                <p className="setupWizardBody">{ENV_FIX_INSTRUCTIONS[group.id]}</p>
              </div>
            )}
          </div>
        ))}

        <button type="button" className="setupWizardButtonSecondary" onClick={handleCheckAgain}>
          Check again
        </button>
      </div>

      <div className="setupWizardCard">
        <p className="setupWizardBody">
          You can come back and finish these later — Step 6 doesn&apos;t
          require every key above to be set yet.
        </p>
        <button type="button" className="setupWizardButton" onClick={() => setContinued(true)}>
          Continue
        </button>
      </div>
    </div>
  );
}
