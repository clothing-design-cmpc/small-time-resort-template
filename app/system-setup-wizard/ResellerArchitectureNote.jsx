/**
 * FILE: app/system-setup-wizard/ResellerArchitectureNote.jsx
 * ROLE: Client Component — reference-only card rendered inside
 * RemainingEnvStep.jsx (Step 5 of the setup wizard)
 *
 * PURPOSE:
 * Collapsed-by-default reference card explaining the "one master
 * account, isolated child resources per client" pattern for whoever
 * is deploying this template on behalf of a paying client rather
 * than for themselves. Purely informational — it checks nothing and
 * blocks nothing; a single-deployment setup can ignore it entirely,
 * which is why it starts collapsed.
 *
 * Each provider gets its own card: a short numbered setup checklist
 * plus, where one applies, a copyable resource-naming pattern (e.g.
 * "resort-{clientslug}") so the person can paste the pattern
 * straight into GitHub/Supabase/etc. while working through it here.
 *
 * DATA FLOW:
 * Reads the static RESELLER_PROVIDERS / RESELLER_NAMING_TIP from
 * scripts/lib/resellerArchitecture.mjs (the same single-source-of-
 * truth pattern envGroups.mjs already uses for ENV_FIX_INSTRUCTIONS)
 * and renders them — no API calls, no server state. Copy-to-clipboard
 * uses local per-button state instead of the toast system, since this
 * component is nested inside RemainingEnvStep (which has no toast
 * instance of its own) and Rule 22.4 forbids spinning up a second
 * useToast instance just for this card.
 */
"use client";

import { useState } from "react";
import {
  RESELLER_PROVIDERS,
  RESELLER_NAMING_TIP,
} from "@/scripts/lib/resellerArchitecture.mjs";

export default function ResellerArchitectureNote() {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedPattern, setCopiedPattern] = useState(null);

  /**
   * handleCopyPattern
   * Copies a provider's naming pattern to the clipboard and shows a
   * brief "Copied" state on that provider's own button only.
   */
  async function handleCopyPattern(pattern) {
    try {
      await navigator.clipboard.writeText(pattern);
      setCopiedPattern(pattern);
      setTimeout(() => setCopiedPattern((current) => (current === pattern ? null : current)), 1400);
    } catch {
      // Clipboard API unavailable — the pattern is still visible to select and copy manually.
    }
  }

  return (
    <div className="setupWizardCard">
      <button
        type="button"
        className="setupWizardHelpToggle"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        {isOpen ? "Hide" : "Reselling this to multiple clients?"}
      </button>

      {isOpen && (
        <div className="setupWizardInstructions">
          <span className="setupWizardInstructionsLabel">
            One master account, isolated child resources per client
          </span>
          <p className="setupWizardBody">
            Skip this if you&apos;re deploying for a single owner.
            Otherwise: you keep the only login on every provider
            below, but each client gets its own separate resource
            underneath your account — no data crossover, and no risk
            to other clients if one stops renting.
          </p>

          <div className="setupWizardProviderGrid">
            {RESELLER_PROVIDERS.map((provider) => (
              <div key={provider.id} className="setupWizardProviderCard">
                <span className="setupWizardProviderName">{provider.name}</span>
                <ol className="setupWizardProviderSteps">
                  {provider.steps.map((step, stepIndex) => (
                    <li key={stepIndex}>{step}</li>
                  ))}
                </ol>
                {provider.pattern && (
                  <div className="setupWizardProviderPatternRow">
                    <code className="setupWizardProviderPattern">{provider.pattern}</code>
                    <button
                      type="button"
                      className="setupWizardCopyButton"
                      onClick={() => handleCopyPattern(provider.pattern)}
                      aria-label={`Copy naming pattern for ${provider.name}`}
                    >
                      {copiedPattern === provider.pattern ? "Copied" : "Copy"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="setupWizardBody">{RESELLER_NAMING_TIP}</p>
        </div>
      )}
    </div>
  );
}
