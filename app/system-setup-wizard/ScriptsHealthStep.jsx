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
 * Also on this screen — the two "Download … Reference (.txt)" buttons
 * (6.1 Vercel, 6.2 GitHub Actions):
 *   - 6.1: downloads a Vercel env-var reference .txt, built from
 *     ENV_GROUPS (scripts/lib/envGroups.mjs) — the same single source
 *     of truth RemainingEnvStep.jsx already imports this same way
 *   - 6.2: downloads a GitHub Actions repository-secrets reference
 *     .txt — a hand-curated subset (see GITHUB_ACTIONS_SECRETS below),
 *     since Vercel env vars are invisible to GitHub's own runners and
 *     every .github/workflows/*.yml file needs its own copy of these
 *     added under GitHub → Settings → Secrets and variables → Actions
 *   Both now fetch GET /api/system-setup-wizard/env-values first and
 *   fill in KEY=actualValue for every key already present in this
 *   server's own process.env, instead of leaving every line blank —
 *   so the downloaded file can be pasted straight into Vercel/GitHub
 *   with far less manual copy-pasting from .env.local. Any key still
 *   missing (or the fetch itself failing) gets an inline "⚠ MISSING"
 *   / "⚠ COULD NOT READ" note on that exact line instead of silently
 *   leaving it blank with no explanation — see buildMissingNote().
 *
 * DATA FLOW:
 * 1. "Run Env Check" click -> GET env-check -> render per-group ✓/✕
 *    plus the 4 live-check rows
 * 2. "Run Health Check" click -> GET health-check -> render
 *    connectivity, core tables, and any double-booking conflicts
 * 3. Each run logs its own security event server-side (not gated by
 *    a one-time flag — these are repeatable diagnostics, not
 *    milestones like Step 3’s admin confirmation)
 * 4. Download button click -> GET env-values -> build the .txt with
 *    real values filled in -> Blob + save-as, per downloadTextFile()
 */
"use client";

import { useState } from "react";
import { useToast } from "./shared/useToast";
import ToastStack from "./shared/ToastStack";
import ExternalSetupStep from "./ExternalSetupStep";
import { ENV_GROUPS, ENV_FIX_INSTRUCTIONS } from "@/scripts/lib/envGroups.mjs";

// Per-key lookup derived from ENV_GROUPS + ENV_FIX_INSTRUCTIONS (both
// group-level) — GITHUB_ACTIONS_SECRETS below is a flat key list, so
// buildGithubSecretsReference() needs the fix hint by individual key,
// not by group id.
const ENV_FIX_INSTRUCTIONS_BY_KEY = ENV_GROUPS.reduce((map, group) => {
  for (const { key } of group.keys) {
    map[key] = ENV_FIX_INSTRUCTIONS[group.id];
  }
  return map;
}, {});

// Step 5.2 — the exact union of `secrets.*` references across every
// file in .github/workflows/ (verified by grep against the 7 workflow
// YAMLs: database-backup, manual-database-backup, database-restore,
// database-wipe-executor, pre-wipe-backup, env-check, security-log-
// retention). This is a DELIBERATELY separate, hand-curated list, not
// derived from ENV_GROUPS above — GitHub Actions only needs the subset
// those workflows actually reference (e.g. none of the AI Insight keys
// or BASE_URL), not the full app env surface. If a workflow file is
// ever edited to reference a new secret, this list must be updated to
// match — nothing enforces the two staying in sync automatically.
const GITHUB_ACTIONS_SECRETS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLOUDFLARE_R2_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET_NAME",
  "NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL",
  "EMAILJS_SERVICE_ID",
  "EMAILJS_GENERAL_TEMPLATE_ID",
  "EMAILJS_PUBLIC_KEY",
  "EMAILJS_PRIVATE_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "MAXMIND_DB_PATH",
  "VAULT_SETUP_KEY",
  "VAULT_OWNER_EMAIL",
  "VAULT_ALERT_WEBHOOK_URL",
  "CRON_SECRET",
  "GITHUB_ACTIONS_TOKEN",
  "GITHUB_REPO_OWNER",
  "GITHUB_REPO_NAME",
  "NEXT_PUBLIC_SITE_URL",
];

/**
 * downloadTextFile
 * Builds a Blob entirely client-side and triggers a browser download —
 * no server round trip, since both reference lists below are just key
 * NAMES (ENV_GROUPS and GITHUB_ACTIONS_SECRETS), never actual values.
 * Nothing here can ever leak a real secret, even accidentally.
 */
function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * buildEnvLine
 * Renders one KEY=value line for the reference files below. When the
 * key is present in `values` (from GET env-values), the real value is
 * written straight after the `=` — ready to paste as-is. When it's
 * missing, the line stays KEY= (still safe to paste into a form
 * field) with a trailing "⚠ MISSING" / "⚠ COULD NOT READ" comment
 * naming exactly why, instead of a blank line that looks the same as
 * "not needed yet".
 *
 * @param key       - env var name
 * @param required  - from envGroups.mjs — only required keys get the
 *                    louder "⚠ MISSING" note; optional ones just get
 *                    a quieter "not set" note so the file doesn't cry
 *                    wolf on keys that are fine to leave blank
 * @param values    - the { [key]: { value, present } } map from
 *                    GET env-values, or null if that fetch failed
 * @param fixHint   - short "where do I get this" pointer, shown only
 *                    on missing/unreadable lines
 */
function buildEnvLine(key, required, values, fixHint) {
  if (!values) {
    // The env-values fetch itself failed — every line gets the same
    // explicit "couldn't check" note rather than silently rendering
    // as if nothing were configured yet.
    return `${key}=  # ⚠ COULD NOT READ — env-values check failed, see note at top of file`;
  }

  const entry = values[key];
  if (entry?.present) {
    return `${key}=${entry.value}`;
  }
  if (required) {
    return `${key}=  # ⚠ MISSING — ${fixHint}`;
  }
  return `${key}=  # optional, not set`;
}

/**
 * buildVercelEnvReference
 * One KEY=value line per envGroups.mjs entry, grouped under a comment
 * header per group label — ready to paste into Vercel -> Project ->
 * Settings -> Environment Variables one at a time. Real values are
 * filled in from `values` (this server's own process.env, read via
 * GET env-values) wherever present; anything still missing gets an
 * inline note instead of a silent blank line — see buildEnvLine().
 */
function buildVercelEnvReference(values, valuesFetchFailed) {
  const missingRequiredCount = ENV_GROUPS.reduce(
    (count, group) =>
      count + group.keys.filter(({ key, required }) => required && !values?.[key]?.present).length,
    0
  );

  const lines = [
    "# your-private-resort — Vercel Environment Variables Reference",
    "# Generated by the setup wizard (Step 6.1). Values below are read",
    "# live from this dev server's own process.env — double-check each",
    "# one before pasting into Vercel -> Project -> Settings ->",
    "# Environment Variables. Also set SEED_ADMIN_EMAIL /",
    "# SEED_ADMIN_PASSWORD there if you ever need to re-run the seed",
    "# against production (not part of envGroups.mjs — see Step 3).",
  ];

  if (valuesFetchFailed) {
    lines.push(
      "#",
      "# ⚠ Could not read current values from the server when this file",
      "# was generated — every line below is blank. Make sure the dev",
      "# server is running and try downloading again."
    );
  } else if (missingRequiredCount > 0) {
    lines.push(
      "#",
      `# ⚠ ${missingRequiredCount} required key(s) below are still missing — look for`,
      "# the \"⚠ MISSING\" note on each one for where to get it, or revisit",
      "# Step 4 (Remaining services) in the wizard for the full walkthrough."
    );
  }
  lines.push("");

  for (const group of ENV_GROUPS) {
    lines.push(`# --- ${group.label} ---`);
    const fixHint = ENV_FIX_INSTRUCTIONS[group.id] ?? "see Step 4 in the wizard for how to get this value";
    for (const { key, required } of group.keys) {
      lines.push(buildEnvLine(key, required, valuesFetchFailed ? null : values, fixHint));
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * buildGithubSecretsReference
 * Flat KEY=value list for GITHUB_ACTIONS_SECRETS — paste each one
 * into GitHub -> Settings -> Secrets and variables -> Actions -> New
 * repository secret. Separate destination from Vercel above; GitHub
 * Actions runners cannot read Vercel's environment variables at all,
 * so every one of these must be added a second time, by hand. Real
 * values filled in the same way as buildVercelEnvReference() above —
 * see buildEnvLine().
 */
function buildGithubSecretsReference(values, valuesFetchFailed) {
  const missingCount = GITHUB_ACTIONS_SECRETS.filter((key) => !values?.[key]?.present).length;

  const lines = [
    "# your-private-resort — GitHub Actions Repository Secrets",
    "# Generated by the setup wizard (Step 6.2). Values below are read",
    "# live from this dev server's own process.env — double-check each",
    "# one, then paste into:",
    "#   GitHub repo -> Settings -> Secrets and variables -> Actions",
    "#   -> New repository secret",
    "# These power the 7 scheduled/manual workflows in .github/workflows/",
    "# (nightly backup, env-check, security-log retention, manual",
    "# backup/restore/wipe). Vercel env vars are NOT visible to GitHub",
    "# Actions runners — every key below must be added here separately,",
    "# even though most also exist in your Vercel project settings.",
  ];

  if (valuesFetchFailed) {
    lines.push(
      "#",
      "# ⚠ Could not read current values from the server when this file",
      "# was generated — every line below is blank. Make sure the dev",
      "# server is running and try downloading again."
    );
  } else if (missingCount > 0) {
    lines.push(
      "#",
      `# ⚠ ${missingCount} key(s) below are still missing — look for the`,
      "# \"⚠ MISSING\" note on each one for where to get it."
    );
  }
  lines.push("");

  for (const key of GITHUB_ACTIONS_SECRETS) {
    // Every GitHub Actions secret is treated as required here — this
    // hand-curated list only contains keys the 7 workflows actually
    // reference, so there's no "optional" tier to distinguish.
    const fixHint = ENV_FIX_INSTRUCTIONS_BY_KEY[key] ?? "see Step 4 in the wizard for how to get this value";
    lines.push(buildEnvLine(key, true, valuesFetchFailed ? null : values, fixHint));
  }
  return lines.join("\n");
}

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
  const [isDownloadingVercelReference, setIsDownloadingVercelReference] = useState(false);
  const [isDownloadingGithubReference, setIsDownloadingGithubReference] = useState(false);
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

  /**
   * fetchEnvValues
   * Pulls the real { [key]: { value, present } } map from GET
   * env-values for this running dev server. Never throws — a failed
   * fetch returns null so both download handlers can still produce a
   * file (with an explicit "⚠ COULD NOT READ" note on every line)
   * instead of blocking the download entirely.
   */
  async function fetchEnvValues() {
    try {
      const response = await fetch("/api/system-setup-wizard/env-values", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) {
        return null;
      }
      return result.data.values;
    } catch {
      return null;
    }
  }

  async function handleDownloadVercelReference() {
    setIsDownloadingVercelReference(true);
    const values = await fetchEnvValues();
    downloadTextFile("vercel-env-reference.txt", buildVercelEnvReference(values, !values));
    showToast(
      values ? "✓ Vercel env reference downloaded with current values." : "⚠ Downloaded, but couldn't read current values — see note in the file.",
      values ? "success" : "warning"
    );
    setIsDownloadingVercelReference(false);
  }

  async function handleDownloadGithubSecretsReference() {
    setIsDownloadingGithubReference(true);
    const values = await fetchEnvValues();
    downloadTextFile("github-actions-secrets-reference.txt", buildGithubSecretsReference(values, !values));
    showToast(
      values
        ? "✓ GitHub Actions secrets reference downloaded with current values."
        : "⚠ Downloaded, but couldn't read current values — see note in the file.",
      values ? "success" : "warning"
    );
    setIsDownloadingGithubReference(false);
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
        <span className="setupWizardEyebrow">Step 5 of 10</span>
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
        <h2 className="setupWizardSubStepTitle">6.1 — Vercel environment variables</h2>
        <p className="setupWizardBody">
          Every key from the checklists above (Steps 2 and 5), grouped and ready to paste into{" "}
          <code>Vercel → Project → Settings → Environment Variables</code>. Values are read live
          from this dev server, so if you&apos;ve already filled in <code>.env.local</code> and{" "}
          restarted <code>npm run dev</code>, the download comes pre-filled — anything still
          missing gets a <code>⚠ MISSING</code> note instead of a blank line.
        </p>
        <button
          type="button"
          className="setupWizardButtonSecondary"
          onClick={handleDownloadVercelReference}
          disabled={isDownloadingVercelReference}
        >
          {isDownloadingVercelReference ? "Reading current values…" : "Download Vercel Env Reference (.txt)"}
        </button>
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">6.2 — GitHub Actions repository secrets</h2>
        <p className="setupWizardBody">
          The 7 scheduled/manual workflows in <code>.github/workflows/</code> (nightly backup,
          env-check, weekly security-log retention, manual backup/restore/wipe) run on GitHub&apos;s
          own servers — they can&apos;t read your Vercel environment variables at all. Every key
          below must ALSO be added, by hand, at{" "}
          <code>GitHub repo → Settings → Secrets and variables → Actions → New repository secret</code>.
          Skipping this step means those workflows fail silently — nothing in the browser will
          ever show you why. Values are read live from this dev server the same way as 6.1 —
          anything still missing gets a <code>⚠ MISSING</code> note instead of a blank line.
        </p>
        <button
          type="button"
          className="setupWizardButtonSecondary"
          onClick={handleDownloadGithubSecretsReference}
          disabled={isDownloadingGithubReference}
        >
          {isDownloadingGithubReference ? "Reading current values…" : "Download GitHub Secrets Reference (.txt)"}
        </button>
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