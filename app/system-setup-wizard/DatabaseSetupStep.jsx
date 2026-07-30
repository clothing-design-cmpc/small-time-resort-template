/**
 * FILE: app/system-setup-wizard/DatabaseSetupStep.jsx
 * ROLE: Client Component — Steps 2 & 3 of the setup wizard
 *
 * PURPOSE:
 * Renders once SetupKeyForm confirms the WIZARD_SETUP_KEY (Step 1).
 * Covers:
 *   Step 2 — connection + core env var checklist (DATABASE_URL,
 *            DIRECT_URL, plus the supabase group: NEXT_PUBLIC_SUPABASE_URL,
 *            NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
 *   Step 2 — 4 sequential, locked sub-steps: db push -> generate ->
 *            enableRls.js -> addBookingExclusionConstraint.js
 * Every sub-step that leaves a trace in the database (3a, 3c, 3d) is
 * verified for real against /api/system-setup-wizard/database-status
 * rather than trusted on a checkbox — only 3b (`prisma generate`,
 * which only touches the local Prisma Client, never the DB) uses a
 * manual "I ran this" confirmation, since there's nothing in the
 * database to check for it.
 *
 * DATA FLOW:
 * 1. On mount and on every "Check again" click -> GET
 *    /api/system-setup-wizard/database-status
 * 2. Response drives which sub-step is unlocked/complete
 * 3. 3b's manual confirmation persists in sessionStorage so a refresh
 *    mid-session doesn't lose it (this session already has a 30-minute
 *    cookie lifetime — sessionStorage matches that scope)
 * 4. Once exclusionConstraint is true, this step hands off to
 *    <AdminSetupStep /> (Step 3 — Create Super-Admin), same
 *    hand-off pattern SetupKeyForm.jsx uses to reach this file
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "./shared/useToast";
import ToastStack from "./shared/ToastStack";
import AdminSetupStep from "./AdminSetupStep";

const GENERATE_CONFIRMED_STORAGE_KEY = "wizardStep3bGenerateConfirmed";

const DATABASE_ENV_HELP = {
  DATABASE_URL: {
    label: "Transaction pooler connection (port 6543)",
    steps: [
      "Open your project on supabase.com and click the green \"Connect\"\n           button at the top of the project page.",
      "Under \"Connection Method\", select \"Transaction pooler\" (keep Type\n           as URI) and copy that connection string.",
      "Paste it as DATABASE_URL= in .env.local — this is what the live\n           app uses for normal request traffic.",
    ],
  },
  DIRECT_URL: {
    label: "Session pooler connection (port 5432)",
    steps: [
      "Same \"Connect\" panel — switch \"Connection Method\" to \"Session\n           pooler\" (use \"Direct connection\" instead only if your network\n           supports IPv6) and copy that connection string.",
      "Paste it as DIRECT_URL= in .env.local — this is what schema commands\n           (db push, enableRls.js, the exclusion constraint script) need,\n           since they require a stable session the transaction pooler\n           doesn't reliably provide.",
    ],
  },
  NEXT_PUBLIC_SUPABASE_URL: {
    label: "Project URL",
    steps: [
      "On the project overview page, click the small \"Copy\" dropdown next\n           to the project URL (top-left, under the project name).",
      "Select \"Project URL\" from the dropdown.",
      "Paste it as NEXT_PUBLIC_SUPABASE_URL= in .env.local.",
    ],
  },
  NEXT_PUBLIC_SUPABASE_ANON_KEY: {
    label: "Anon / public key",
    steps: [
      "Supabase Dashboard → Settings → API Keys → click the \"Legacy anon,\n           service_role API keys\" tab (not the default \"Publishable and\n           secret API keys\" tab — this codebase expects the legacy\n           format). Copy the \"anon\" key.",
      "Paste it as NEXT_PUBLIC_SUPABASE_ANON_KEY= in .env.local — safe to\n           expose to the browser, protected by Row Level Security.",
    ],
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    label: "Service role key",
    steps: [
      "Same \"Legacy anon, service_role API keys\" tab on Settings → API\n           Keys — copy the \"service_role\" key.",
      "Paste it as SUPABASE_SERVICE_ROLE_KEY= in .env.local — NEVER prefix\n           this with NEXT_PUBLIC_, never commit it, never expose it to the\n           client. It bypasses Row Level Security entirely.",
    ],
  },
};

const SUB_STEPS = [
  {
    id: "dbPush",
    order: "3a",
    title: "Sync the schema to your database",
    command: "npx prisma db push",
    description: "Creates every table, column, and enum defined in prisma/schema.prisma directly on your Supabase database.",
    expectedOutput: "Your database is now in sync with your Prisma schema.",
  },
  {
    id: "generate",
    order: "3b",
    title: "Rebuild the Prisma Client",
    command: "npx prisma generate",
    description: "Regenerates the local Prisma Client so your code recognizes every model and field from the schema you just pushed.",
    expectedOutput: "✔ Generated Prisma Client",
    manualOnly: true,
  },
  {
    id: "rls",
    order: "3c",
    title: "Enable Row Level Security",
    command: "node prisma/enableRls.js",
    description: "One-time: turns on RLS and adds public-read policies on rooms, amenities, store_products, admin_profiles, and bookings.",
    expectedOutput: "✓ alter table rooms enable row level security; (and 4 more)",
  },
  {
    id: "exclusion",
    order: "3d",
    title: "Add the double-booking guarantee",
    command: "node prisma/addBookingExclusionConstraint.js",
    description: "One-time: enables the btree_gist extension and a database-level constraint that physically rejects overlapping confirmed bookings for the same room.",
    expectedOutput: "✓ create extension if not exists btree_gist; ...",
  },
];

export default function DatabaseSetupStep() {
  const { toasts, showToast, dismissToast } = useToast();

  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [generateConfirmed, setGenerateConfirmed] = useState(false);
  const [openHelpKey, setOpenHelpKey] = useState(null);

  // Restore the one manual confirmation (3b) from this tab's session —
  // matches the wizard session cookie's own 30-minute scope.
  useEffect(() => {
    const stored = window.sessionStorage.getItem(GENERATE_CONFIRMED_STORAGE_KEY);
    if (stored === "true") setGenerateConfirmed(true);
  }, []);

  /**
   * fetchStatus
   * Pulls real, DB-derived completion for every verifiable sub-step.
   * Never throws to the caller — network/server failures surface as a
   * user-facing error message instead.
   */
  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/system-setup-wizard/database-status");
      const result = await response.json();

      if (!response.ok || !result.success) {
        setLoadError(result.message ?? "We couldn't check the database status. Please try again.");
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

  /**
   * handleCopy
   * Copies a terminal command to the clipboard so it can be pasted
   * exactly as written — no risk of a typo breaking a DDL statement.
   */
  async function handleCopy(command) {
    try {
      await navigator.clipboard.writeText(command);
      showToast("✓ Command copied.", "success");
    } catch {
      showToast("✕ Couldn't copy automatically — please copy it manually.", "error");
    }
  }

  function handleCheckAgain() {
    fetchStatus();
  }

  function handleGenerateConfirmedChange(event) {
    const checked = event.target.checked;
    setGenerateConfirmed(checked);
    window.sessionStorage.setItem(GENERATE_CONFIRMED_STORAGE_KEY, checked ? "true" : "false");
  }

  if (isLoading && !status) {
    return (
      <div className="setupWizardCard" role="status">
        <span className="setupWizardEyebrow">Step 2 of 10</span>
        <h1 className="setupWizardTitle">Checking database status…</h1>
      </div>
    );
  }

  if (loadError && !status) {
    return (
      <div className="setupWizardCard" role="alert">
        <span className="setupWizardEyebrow">Step 2 of 10</span>
        <h1 className="setupWizardTitle">Couldn&apos;t load database status</h1>
        <p className="setupWizardError">{loadError}</p>
        <button type="button" className="setupWizardButton" onClick={handleCheckAgain}>
          Try again
        </button>
      </div>
    );
  }

  const envReady = status.envReady;
  const dbPushDone = status.dbPushDone;
  const rlsEnabled = status.rlsEnabled;
  const exclusionDone = status.exclusionConstraint;

  // Sequential unlock: each sub-step opens only once the one before it
  // is genuinely done (server-verified for 3a/3c/3d, manual for 3b).
  const subStepUnlocked = {
    dbPush: envReady,
    generate: dbPushDone,
    rls: generateConfirmed,
    exclusion: rlsEnabled,
  };
  const subStepDone = {
    dbPush: dbPushDone,
    generate: generateConfirmed,
    rls: rlsEnabled,
    exclusion: exclusionDone,
  };

  if (exclusionDone) {
    return <AdminSetupStep />;
  }

  return (
    <div className="setupWizardStepGroup">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* ===== Step 2 — Connection + Core env vars ===== */}
      <div className="setupWizardCard">
        <span className="setupWizardEyebrow">Step 2 of 10</span>
        <h1 className="setupWizardTitle">Database connection &amp; Supabase core</h1>
        <p className="setupWizardBody">
          Set these keys in <code>.env.local</code> from your Supabase
          project, then restart <code>npm run dev</code>.
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
                      {item.present ? "✓ Set" : "✕ Missing"}
                    </span>
                    <code>{item.key}</code>
                  </div>
                  <button
                    type="button"
                    className="setupWizardHelpToggle"
                    onClick={() => setOpenHelpKey(openHelpKey === item.key ? null : item.key)}
                  >
                    {openHelpKey === item.key ? "Hide" : "How do I get this?"}
                  </button>
                  {openHelpKey === item.key && (
                    <div className="setupWizardInstructions">
                      <span className="setupWizardInstructionsLabel">
                        {DATABASE_ENV_HELP[item.key]?.label}
                      </span>
                      <ol className="setupWizardInstructionsList">
                        {DATABASE_ENV_HELP[item.key]?.steps.map((stepText, index) => (
                          <li key={index}>{stepText}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <button type="button" className="setupWizardButtonSecondary" onClick={handleCheckAgain}>
          Check again
        </button>
      </div>

      {/* ===== Step 2 — Sequential database setup commands ===== */}
      {SUB_STEPS.map((subStep) => {
        const unlocked = subStepUnlocked[subStep.id];
        const done = subStepDone[subStep.id];

        return (
          <div
            key={subStep.id}
            className={`setupWizardCard setupWizardSubStepCard ${
              !unlocked ? "setupWizardSubStepCard--locked" : ""
            }`}
          >
            <span className="setupWizardEyebrow">Step {subStep.order} of 10</span>
            <h2 className="setupWizardSubStepTitle">{subStep.title}</h2>
            <p className="setupWizardBody">{subStep.description}</p>

            {!unlocked ? (
              <p className="setupWizardLockedNotice">
                Complete the previous sub-step first.
              </p>
            ) : (
              <>
                <div className="setupWizardCommandRow">
                  <code className="setupWizardCodeBlock">{subStep.command}</code>
                  <button
                    type="button"
                    className="setupWizardCopyButton"
                    onClick={() => handleCopy(subStep.command)}
                  >
                    Copy
                  </button>
                </div>
                <p className="setupWizardExpectedOutput">
                  Expected output: <code>{subStep.expectedOutput}</code>
                </p>

                {subStep.manualOnly ? (
                  <label className="setupWizardCheckboxLabel">
                    <input
                      type="checkbox"
                      checked={generateConfirmed}
                      onChange={handleGenerateConfirmedChange}
                    />
                    I ran this command
                  </label>
                ) : (
                  <div className="setupWizardVerifyRow">
                    <span
                      className={`setupWizardStatusBadge ${
                        done ? "setupWizardStatusBadge--ok" : "setupWizardStatusBadge--missing"
                      }`}
                    >
                      {done ? "✓ Verified" : "✕ Not detected yet"}
                    </span>
                    <button
                      type="button"
                      className="setupWizardButtonSecondary"
                      onClick={handleCheckAgain}
                    >
                      Check again
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
