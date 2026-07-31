/**
 * FILE: app/system-setup-wizard/DeploymentStep.jsx
 * ROLE: Client Component — Step 9 of the setup wizard
 *
 * PURPOSE:
 * Renders once VerifyVaultAccessStep's "I've Verified Vault Access" is
 * clicked (Step 8). Everything before this step ran against
 * localhost — this step exists so the project actually goes live
 * before <PreHandoffTestingStep /> (Step 10) runs its "test the real,
 * deployed site (not just localhost)" checklist. Without this step,
 * Step 10 would have no live URL to test against.
 *
 * Like ExternalSetupStep.jsx (Step 6), this is pure reference
 * instructions — no server calls, nothing this page can verify for
 * you, since deploying and pointing DNS both happen outside this app
 * entirely (Vercel's dashboard/CLI, Hostinger's hPanel). "Continue"
 * is a plain client-side acknowledgment, same pattern Step 6 uses.
 *
 * THREE PARTS COVERED:
 *   1. Push to GitHub + import the project into Vercel, with every
 *      .env.local key copied into Vercel's Environment Variables.
 *   2. Buy/point a domain on Hostinger, then add it in Vercel and
 *      create the DNS records Hostinger's DNS Zone Editor needs
 *      (apex A record -> 76.76.21.21, www CNAME -> cname.vercel-dns.com
 *      — Vercel's own domain card shows the exact values for this
 *      project, since they can differ per-project; these are the
 *      general-purpose defaults).
 *   3. Post-deploy updates that are easy to forget: NEXT_PUBLIC_SITE_URL
 *      (siteConfig group, Step 4) must point at the final domain, not
 *      the Vercel-assigned *.vercel.app one, and CRON_SECRET plus
 *      every other .env.local secret must be re-entered in Vercel's
 *      Environment Variables — .env.local never leaves the local
 *      machine, so Vercel starts with none of them set.
 *
 * Sub-steps 7 and 8 — the "Download … Reference (.txt)" buttons
 * (moved here from ScriptsHealthStep.jsx / Step 5, where they were
 * labeled 6.1/6.2 — Step 9 is the actual moment these are needed,
 * since by now every API key is set (Steps 2-4) and the vault has
 * been created and verified (Steps 6-8)):
 *   - 7: downloads a Vercel env-var reference .txt, built from
 *     ENV_GROUPS (scripts/lib/envGroups.mjs) — the same single source
 *     of truth RemainingEnvStep.jsx already imports this same way
 *   - 8: downloads a GitHub Actions repository-secrets reference
 *     .txt — a hand-curated subset (see GITHUB_ACTIONS_SECRETS below),
 *     since Vercel env vars are invisible to GitHub's own runners and
 *     every .github/workflows/*.yml file needs its own copy of these
 *     added under GitHub → Settings → Secrets and variables → Actions
 *   Both fetch GET /api/system-setup-wizard/env-values first and fill
 *   in KEY=actualValue for every key already present in this server's
 *   own process.env, instead of leaving every line blank — so the
 *   downloaded file can be pasted straight into Vercel/GitHub with
 *   far less manual copy-pasting from .env.local. Any key still
 *   missing (or the fetch itself failing) gets an inline "⚠ MISSING"
 *   / "⚠ COULD NOT READ" note on that exact line instead of silently
 *   leaving it blank with no explanation — see buildEnvLine().
 *
 * DATA FLOW: parts 1-6 are pure client-side reference, no server
 * calls. Sub-steps 7/8 call GET env-values -> build the .txt with
 * real values filled in -> Blob + save-as, per downloadTextFile().
 * "Continue" hands off to <PreHandoffTestingStep /> (Step 10).
 */
"use client";

import { useState } from "react";
import { useToast } from "./shared/useToast";
import ToastStack from "./shared/ToastStack";
import PreHandoffTestingStep from "./PreHandoffTestingStep";
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

// The exact union of `secrets.*` references across every file in
// .github/workflows/ (verified by grep against the 7 workflow YAMLs:
// database-backup, manual-database-backup, database-restore,
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
    "# Generated by the setup wizard (Step 9.7). Values below are read",
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
    "# Generated by the setup wizard (Step 9.8). Values below are read",
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

// Deploy commands a person can also run from the Vercel CLI instead of
// the dashboard import flow — optional, dashboard works fine on its own.
const DEPLOY_COMMANDS = [
  {
    title: "1. Install the Vercel CLI (optional — dashboard import works too)",
    command: "npm install -g vercel",
    description: "Only needed if you'd rather deploy from the terminal than vercel.com's dashboard import.",
  },
  {
    title: "2. Deploy from the project root",
    command: "vercel --prod",
    description:
      "Links this folder to a Vercel project on first run (prompts for scope + project name), then deploys straight to production. Re-running this later ships a new deploy without going through GitHub at all.",
  },
];

// The exact DNS records Hostinger's DNS Zone Editor needs. Vercel's own
// domain card (Project -> Settings -> Domains -> your domain) shows the
// authoritative value for this specific project — use that if it ever
// differs from the general-purpose value below.
const DNS_RECORDS = [
  { type: "A", host: "@", value: "76.76.21.21", note: "Apex/root domain (e.g. yourresort.com)" },
  { type: "CNAME", host: "www", value: "cname.vercel-dns.com", note: "www subdomain (e.g. www.yourresort.com)" },
];

export default function DeploymentStep() {
  const { toasts, showToast, dismissToast } = useToast();
  const [continued, setContinued] = useState(false);
  const [isDownloadingVercelReference, setIsDownloadingVercelReference] = useState(false);
  const [isDownloadingGithubReference, setIsDownloadingGithubReference] = useState(false);

  async function handleCopy(value) {
    try {
      await navigator.clipboard.writeText(value);
      showToast("✓ Copied.", "success");
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

  if (continued) {
    return <PreHandoffTestingStep />;
  }

  return (
    <div className="setupWizardStepGroup">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className="setupWizardCard">
        <span className="setupWizardEyebrow">Step 9 of 11</span>
        <h1 className="setupWizardTitle">Deploy to Vercel &amp; connect your domain</h1>
        <p className="setupWizardBody">
          Everything so far has run on localhost. This step puts the site on a real URL —
          required before the next step&apos;s live-site checklist means anything.
        </p>
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">1. Push the repo to GitHub</h2>
        <p className="setupWizardBody">
          If this project isn&apos;t already on GitHub, create a repo and push the{" "}
          <code>static</code> branch there first — Vercel&apos;s dashboard import needs a Git
          repo to connect to (the CLI option below doesn&apos;t).
        </p>
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">2. Import the project into Vercel</h2>
        <p className="setupWizardBody">
          Go to <code>vercel.com</code>, sign in with GitHub, click &quot;Add New&quot; →
          &quot;Project&quot;, and select this repo. Before the first deploy, open the
          &quot;Environment Variables&quot; section and paste in every key from{" "}
          <code>.env.local</code> — Vercel starts with none of them set, since{" "}
          <code>.env.local</code> is git-ignored and never leaves your machine (Rule 18.5).
          Missing keys here is the single most common reason a deploy builds fine but the
          live site 500s on its first real request.
        </p>
        <p className="setupWizardBody">
          Alternatively, deploy from the CLI instead of the dashboard import:
        </p>
        {DEPLOY_COMMANDS.map((item) => (
          <div key={item.command} className="setupWizardCommandRow">
            <code className="setupWizardCodeBlock">{item.command}</code>
            <button type="button" className="setupWizardCopyButton" onClick={() => handleCopy(item.command)}>
              Copy
            </button>
          </div>
        ))}
        <p className="setupWizardBody">
          The CLI still needs every <code>.env.local</code> key added separately under Project
          Settings → Environment Variables in the dashboard — <code>vercel --prod</code> does
          not read <code>.env.local</code> for you.
        </p>
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">3. Buy/point your domain on Hostinger</h2>
        <p className="setupWizardBody">
          If you don&apos;t already own the domain, buy it through Hostinger&apos;s hPanel →
          Domains. If you already own it elsewhere, this step assumes Hostinger is managing
          its DNS (hPanel → Domains → your domain → DNS / Nameservers).
        </p>
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">4. Add the domain in Vercel</h2>
        <p className="setupWizardBody">
          In the Vercel project → Settings → Domains, type in your domain and click Add.
          Vercel shows the exact DNS records it needs — they usually match the table below,
          but always use the value shown on your own project&apos;s domain card if it differs.
        </p>
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">5. Create the DNS records in Hostinger</h2>
        <p className="setupWizardBody">
          hPanel → Domains → your domain → DNS / Nameservers → DNS Zone Editor. Add both
          records below. If Hostinger auto-created a conflicting record on the same host
          (e.g. a default A record for <code>www</code>), delete it first — two competing
          records on the same host causes intermittent SSL/verification failures.
        </p>
        {DNS_RECORDS.map((record) => (
          <div key={record.host} className="setupWizardCommandRow">
            <code className="setupWizardCodeBlock">
              {record.type}  {record.host}  →  {record.value}
            </code>
            <button
              type="button"
              className="setupWizardCopyButton"
              onClick={() => handleCopy(record.value)}
            >
              Copy
            </button>
          </div>
        ))}
        <p className="setupWizardBody">
          {DNS_RECORDS.map((r) => r.note).join(" • ")}. DNS propagation is usually minutes but
          can take up to 24–48 hours — Vercel provisions an SSL certificate automatically once
          it verifies, no action needed on your end for that part.
        </p>
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">6. Post-deploy env var updates</h2>
        <p className="setupWizardBody">
          Two things are easy to forget once the domain is live:
        </p>
        <p className="setupWizardBody">
          • Update <code>NEXT_PUBLIC_SITE_URL</code> in Vercel&apos;s Environment Variables to
          your final domain (e.g. <code>https://yourresort.com</code>), not the temporary{" "}
          <code>*.vercel.app</code> one Vercel assigns by default — this is the same key
          documented back in Step 4&apos;s siteConfig group, now pointed at the real address.
        </p>
        <p className="setupWizardBody">
          • Confirm <code>CRON_SECRET</code> in Vercel matches <code>.env.local</code> exactly
          — a mismatch fails the nightly vault auto-rotate and AI insight cron jobs silently
          with a 401, and won&apos;t surface until someone checks the Vercel cron logs.
        </p>
        <p className="setupWizardBody">
          After changing any environment variable in Vercel, redeploy (Vercel → Deployments →
          &quot;⋯&quot; on the latest deploy → Redeploy) — env var changes don&apos;t apply to
          an already-built deployment.
        </p>
      </div>

      <div className="setupWizardCard">
        <h2 className="setupWizardSubStepTitle">7. Vercel environment variables reference</h2>
        <p className="setupWizardBody">
          Every key from the checklists above (Steps 2 and 4), grouped and ready to paste into{" "}
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
        <h2 className="setupWizardSubStepTitle">8. GitHub Actions repository secrets</h2>
        <p className="setupWizardBody">
          The 7 scheduled/manual workflows in <code>.github/workflows/</code> (nightly backup,
          env-check, weekly security-log retention, manual backup/restore/wipe) run on GitHub&apos;s
          own servers — they can&apos;t read your Vercel environment variables at all. Every key
          below must ALSO be added, by hand, at{" "}
          <code>GitHub repo → Settings → Secrets and variables → Actions → New repository secret</code>.
          Skipping this step means those workflows fail silently — nothing in the browser will
          ever show you why. Values are read live from this dev server the same way as step 7 —
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
          Once the domain resolves and loads the live site, continue to the pre-handoff
          testing checklist — that step assumes a real, deployed URL, not localhost.
        </p>
        <button type="button" className="setupWizardButton" onClick={() => setContinued(true)}>
          Continue
        </button>
      </div>
    </div>
  );
}
