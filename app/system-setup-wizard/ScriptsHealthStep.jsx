/**
 * FILE: app/system-setup-wizard/ScriptsHealthStep.jsx
 * ROLE: Client Component — Step 5 of the setup wizard
 *
 * PURPOSE:
 * Renders once RemainingEnvStep's "Continue" is clicked (Step 4 never
 * blocks on every key being set — see that file's own header). Two
 * on-demand, server-triggered checks plus a set of terminal-only
 * reference commands that are never executable from the page (per the
 * plan's "READ-ONLY VS TERMINAL-ONLY SCRIPTS" split):
 *   - "Run Env Check" -> GET /api/system-setup-wizard/env-check ->
 *     services/envCheck.js's checkEnvironment() (presence for all 10
 *     groups + 4 live checks: database, GeoIP file, Google Drive
 *     OAuth, EmailJS test send)
 *   - "Run Health Check" -> GET /api/system-setup-wizard/health-check
 *     -> services/systemHealthCheck.js's runSystemHealthCheck()
 *     (connectivity, core tables, double-booking scan)
 * Neither button fires on mount — both are click-triggered only, since
 * the env check's EmailJS live check has a real side effect (one test
 * email sent to VAULT_OWNER_EMAIL).
 *
 * Step 6 (External / Local-Machine-Only Setup) is built as its own
 * component — the Continue button here hands off to <ExternalSetupStep />,
 * same hand-off pattern every prior step uses.
 *
 * NOTE: The "Download Vercel Env Reference" and "Download GitHub Actions
 * Secrets Reference" buttons that used to live on this screen (labeled
 * 6.1/6.2) have moved to <DeploymentStep /> (Step 9) — by that point
 * every API key is set (Steps 2-4) and the vault has been created and
 * verified (Steps 6-7), and Step 9 is the exact moment those reference
 * files are actually needed (pasting values into Vercel/GitHub before
 * deploying). See DeploymentStep.jsx for that implementation.
 *
 * DATA FLOW:
 * 1. "Run Env Check" click -> GET env-check -> render per-group ✓/✕
 *    plus the 4 live-check rows
 * 2. "Run Health Check" click -> GET health-check -> render
 *    connectivity, core tables, and any double-booking conflicts
 * 3. Each run logs its own security event server-side (not gated by
 *    a one-time flag — these are repeatable diagnostics, not
 *    milestones like Step 3’s admin confirmation)
 */
"use client";

import { useState } from "react";
import { useToast } from "./shared/useToast";
import ToastStack from "./shared/ToastStack";
import ExternalSetupStep from "./ExternalSetupStep";

const TERMINAL_COMMANDS = [
  {
    command: "npm run check:gatekeepers",
    description: "Optional health check for the breach-response gatekeeper flow.",
  },
  {
    command: "node scripts/generateEnvSecret.mjs <KEY_NAME>",
    description: "Generates a CSPRNG-backed secret for any key that needs one (e.g. VAULT_SETUP_KEY, WIZARD_SETUP_KEY, CRON_SECRET).",
  },
];

export default function ScriptsHealthStep() {
  const { toasts, showToast, dismissToast } = useToast();

  const [envResult, setEnvResult] = useState(null);
  const [isEnvChecking, setIsEnvChecking] = useState(false);
  const [healthResult, setHealthResult] = useState(null);
  const [isHealthChecking, setIsHealthChecking] = useState(false);
  const [continued, setContinued] = useState(false);

  async function handleRunEnvCheck() {
    setIsEnvChecking(true);
    try {
      const response = await fetch("/api/system-setup-wizard/env-check");
      const result = await response.json();

      if (!response.ok || !result.success) {
        showToast("✕ " + (result.message ?? "Couldn't run the environment check."), "error");
        return;
      }
      setEnvResult(result.data);
      showToast(
        result.data.overallStatus === "ok" ? "✓ Environment check passed." : "⚠ Environment check found issues.",
        result.data.overallStatus === "ok" ? "success" : "warning"
      );
    } catch {
      showToast("✕ We couldn't reach the server. Please try again.", "error");
    } finally {
      setIsEnvChecking(false);
    }
  }

  async function handleRunHealthCheck() {
    setIsHealthChecking(true);
    try {
      const response = await fetch("/api/system-setup-wizard/health-check");
      const result = await response.json();

      if (!response.ok || !result.success) {
        showToast("✕ " + (result.message ?? "Couldn't run the health check."), "error");
        return;
      }
      setHealthResult(result.data);
      showToast(
        result.data.overallStatus === "ok" ? "✓ System health check passed." : "⚠ System health check found issues.",
        result.data.overallStatus === "ok" ? "success" : "warning"
      );
    } catch {
      showToast("✕ We couldn't reach the server. Please try again.", "error");
    } finally {
      setIsHealthChecking(false);
    }
  }

  async function handleCopy(command) {
    try {
      await navigator.clipboard.writeText(command);
      showToast("✓ Command copied.", "success");
    } catch {
      showToast("✕ Couldn't copy automatically — please copy it manually.", "error");
    }
  }

  function statusBadgeClass(status) {
    if (status === "ok") return "setupWizardStatusBadge setupWizardStatusBadge--ok";
    if (status === "failed" || status === "attention_needed") {
      return "setupWizardStatusBadge setupWizardStatusBadge--failed";
    }
    return "setupWizardStatusBadge setupWizardStatusBadge--missing";
  }

  if (continued) {
    return <ExternalSetupStep />;
  }

  return (
    <div className="setupWizardStepGroup">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="setupWizardCard">
        <span className="setupWizardEyebrow">Step 5 of 11</span>
        <h1 className="setupWizardTitle">Scripts &amp; health checks</h1>
        <p className="setupWizardBody">
          Two on-demand checks you can run from here, plus a couple of
          terminal-only reference commands below. Neither button runs
          automatically — the environment check sends one real test
          email, so it only ever fires when you click it.
        </p>

        <div className="setupWizardVerifyRow">
          <button
            type="button"
            className="setupWizardButtonSecondary"
            onClick={handleRunEnvCheck}
            disabled={isEnvChecking}
          >
            {isEnvChecking ? "Checking…" : "Run Env Check"}
          </button>
          {envResult && <span className={statusBadgeClass(envResult.overallStatus)}>{envResult.overallStatus}</span>}
        </div>

        {envResult && (
          <ul className="setupWizardEnvList">
            {envResult.groups.map((group) => (
              <li key={group.id} className="setupWizardEnvItem">
                <div className="setupWizardEnvItemHeader">
                  <span className={statusBadgeClass(group.liveCheck?.status ?? group.status)}>
                    {group.status === "ok" ? "✓" : "✕"}
                  </span>
                  <span className="setupWizardBody">{group.label}</span>
                </div>
                {group.liveCheck && (
                  <span className="setupWizardExpectedOutput">{group.liveCheck.message}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="setupWizardCard">
        <div className="setupWizardVerifyRow">
          <button
            type="button"
            className="setupWizardButtonSecondary"
            onClick={handleRunHealthCheck}
            disabled={isHealthChecking}
          >
            {isHealthChecking ? "Checking…" : "Run Health Check"}
          </button>
          {healthResult && (
            <span className={statusBadgeClass(healthResult.overallStatus)}>{healthResult.overallStatus}</span>
          )}
        </div>

        {healthResult && (
          <ul className="setupWizardEnvList">
            <li className="setupWizardEnvItem">
              <div className="setupWizardEnvItemHeader">
                <span className={statusBadgeClass(healthResult.connectivity.status)}>
                  {healthResult.connectivity.status === "ok" ? "✓" : "✕"}
                </span>
                <span className="setupWizardBody">Database connectivity</span>
              </div>
              <span className="setupWizardExpectedOutput">{healthResult.connectivity.message}</span>
            </li>
            {healthResult.coreTables.map((table) => (
              <li key={table.label} className="setupWizardEnvItem">
                <div className="setupWizardEnvItemHeader">
                  <span className={statusBadgeClass(table.status)}>{table.status === "ok" ? "✓" : "✕"}</span>
                  <span className="setupWizardBody">{table.label}</span>
                </div>
                <span className="setupWizardExpectedOutput">
                  {table.status === "ok" ? `${table.rowCount} rows` : table.message}
                </span>
              </li>
            ))}
            <li className="setupWizardEnvItem">
              <div className="setupWizardEnvItemHeader">
                <span className={statusBadgeClass(healthResult.doubleBookings.length === 0 ? "ok" : "failed")}>
                  {healthResult.doubleBookings.length === 0 ? "✓" : "✕"}
                </span>
                <span className="setupWizardBody">Double-booking scan</span>
              </div>
              <span className="setupWizardExpectedOutput">
                {healthResult.doubleBookings.length === 0
                  ? "No overlapping bookings found."
                  : `${healthResult.doubleBookings.length} conflict(s) found.`}
              </span>
            </li>
          </ul>
        )}
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">Terminal-only reference commands</h2>
        <p className="setupWizardBody">
          These are never run from this page — copy and run them in
          your own terminal as needed.
        </p>
        {TERMINAL_COMMANDS.map((item) => (
          <div key={item.command} className="setupWizardEnvItem">
            <div className="setupWizardCommandRow">
              <code className="setupWizardCodeBlock">{item.command}</code>
              <button
                type="button"
                className="setupWizardCopyButton"
                onClick={() => handleCopy(item.command)}
              >
                Copy
              </button>
            </div>
            <span className="setupWizardExpectedOutput">{item.description}</span>
          </div>
        ))}
      </div>

      <div className="setupWizardCard">
        <p className="setupWizardBody">
          You can come back and run these again anytime — Step 6
          doesn&apos;t require either check above to pass first.
        </p>
        <button type="button" className="setupWizardButton" onClick={() => setContinued(true)}>
          Continue
        </button>
      </div>
    </div>
  );
}