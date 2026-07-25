/**
 * FILE: app/system-setup-wizard/AdminSetupStep.jsx
 * ROLE: Client Component — Step 4 of the setup wizard
 *
 * PURPOSE:
 * Renders once DatabaseSetupStep confirms Steps 2-3 are complete. No
 * custom "create admin" form is built here — the project already has
 * `npx prisma db seed`, an idempotent (upsert-based) script that
 * creates the Supabase Auth user + admin_profiles row with
 * isOwner: true, reading SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from
 * .env.local. This step's job is only to: show those two env keys,
 * show the seed command, and confirm success against the database.
 *
 * Once ownerExists is confirmed true for the first time, this
 * component calls /confirm-admin exactly once (guarded by a
 * sessionStorage flag, same pattern as DatabaseSetupStep's 3b) so the
 * one-time setup_admin_created security event is logged without
 * re-firing on every later poll/refresh.
 *
 * DATA FLOW:
 * 1. On mount and on every "Check again" click -> GET
 *    /api/system-setup-wizard/admin-status
 * 2. First time ownerExists is true and this tab hasn't confirmed yet
 *    -> POST /api/system-setup-wizard/confirm-admin, then mark
 *    confirmed in sessionStorage
 * 3. Once confirmed, hands off to <RemainingEnvStep /> (Step 5 —
 *    remaining environment variables), same hand-off pattern
 *    SetupKeyForm.jsx -> DatabaseSetupStep.jsx -> AdminSetupStep.jsx
 *    already uses. This component's own ToastStack stays mounted
 *    alongside it so the one-time "Super-admin account confirmed"
 *    toast isn't unmounted before its auto-dismiss.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "./shared/useToast";
import ToastStack from "./shared/ToastStack";
import RemainingEnvStep from "./RemainingEnvStep";

const ADMIN_CONFIRMED_STORAGE_KEY = "wizardStep4AdminConfirmed";

export default function AdminSetupStep() {
  const { toasts, showToast, dismissToast } = useToast();

  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Restore this tab's confirmation from sessionStorage — matches the
  // wizard session cookie's own 30-minute scope, same as 3b.
  useEffect(() => {
    const stored = window.sessionStorage.getItem(ADMIN_CONFIRMED_STORAGE_KEY);
    if (stored === "true") setConfirmed(true);
  }, []);

  /**
   * fetchStatus
   * Pulls real, DB-derived owner status plus the two seed env keys'
   * presence. Never throws to the caller — failures surface as a
   * user-facing error message instead.
   */
  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/system-setup-wizard/admin-status");
      const result = await response.json();

      if (!response.ok || !result.success) {
        setLoadError(result.message ?? "We couldn't check the admin status. Please try again.");
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
   * Fires the one-time confirm-admin call the moment ownerExists
   * flips true, so the setup_admin_created security event is logged
   * exactly once per deployment, not once per poll.
   */
  useEffect(() => {
    if (!status?.ownerExists || confirmed || isConfirming) return;

    let cancelled = false;

    async function confirmAdmin() {
      setIsConfirming(true);
      try {
        const response = await fetch("/api/system-setup-wizard/confirm-admin", { method: "POST" });
        const result = await response.json();

        if (cancelled) return;

        if (!response.ok || !result.success) {
          showToast("✕ " + (result.message ?? "Couldn't confirm the admin account."), "error");
          return;
        }

        window.sessionStorage.setItem(ADMIN_CONFIRMED_STORAGE_KEY, "true");
        setConfirmed(true);
        showToast("✓ Super-admin account confirmed.", "success");
      } catch {
        if (!cancelled) showToast("✕ We couldn't reach the server. Please try again.", "error");
      } finally {
        if (!cancelled) setIsConfirming(false);
      }
    }

    confirmAdmin();
    return () => {
      cancelled = true;
    };
  }, [status?.ownerExists, confirmed, isConfirming, showToast]);

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

  if (isLoading && !status) {
    return (
      <div className="setupWizardCard" role="status">
        <span className="setupWizardEyebrow">Step 4 of 10</span>
        <h1 className="setupWizardTitle">Checking admin status…</h1>
      </div>
    );
  }

  if (loadError && !status) {
    return (
      <div className="setupWizardCard" role="alert">
        <span className="setupWizardEyebrow">Step 4 of 10</span>
        <h1 className="setupWizardTitle">Couldn&apos;t load admin status</h1>
        <p className="setupWizardError">{loadError}</p>
        <button type="button" className="setupWizardButton" onClick={handleCheckAgain}>
          Try again
        </button>
      </div>
    );
  }

  if (confirmed) {
    return (
      <>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <RemainingEnvStep />
      </>
    );
  }

  const envItems = [
    { key: "SEED_ADMIN_EMAIL", present: status.seedEmailSet, label: "Owner login email" },
    { key: "SEED_ADMIN_PASSWORD", present: status.seedPasswordSet, label: "Owner login password" },
  ];
  const envReady = status.seedEmailSet && status.seedPasswordSet;

  return (
    <div className="setupWizardStepGroup">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="setupWizardCard">
        <span className="setupWizardEyebrow">Step 4 of 10</span>
        <h1 className="setupWizardTitle">Create your super-admin account</h1>
        <p className="setupWizardBody">
          There&apos;s no form here — the project&apos;s seed script creates your
          owner account directly. Set these two keys in{" "}
          <code>.env.local</code>, then run the seed command below.
        </p>

        <ul className="setupWizardEnvList">
          {envItems.map((item) => (
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
                <span className="setupWizardBody">— {item.label}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div
        className={`setupWizardCard setupWizardSubStepCard ${
          !envReady ? "setupWizardSubStepCard--locked" : ""
        }`}
      >
        <h2 className="setupWizardSubStepTitle">Run the seed script</h2>
        <p className="setupWizardBody">
          Creates the Supabase Auth user and the admin_profiles row with
          isOwner: true. Safe to re-run — it upserts, so it will never
          create a second owner account.
        </p>

        {!envReady ? (
          <p className="setupWizardLockedNotice">Set both keys above first.</p>
        ) : (
          <>
            <div className="setupWizardCommandRow">
              <code className="setupWizardCodeBlock">npx prisma db seed</code>
              <button
                type="button"
                className="setupWizardCopyButton"
                onClick={() => handleCopy("npx prisma db seed")}
              >
                Copy
              </button>
            </div>

            <div className="setupWizardVerifyRow">
              <span
                className={`setupWizardStatusBadge ${
                  status.ownerExists ? "setupWizardStatusBadge--ok" : "setupWizardStatusBadge--missing"
                }`}
              >
                {status.ownerExists ? "✓ Verified" : "✕ Not detected yet"}
              </span>
              <button
                type="button"
                className="setupWizardButtonSecondary"
                onClick={handleCheckAgain}
                disabled={isConfirming}
              >
                Check again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
