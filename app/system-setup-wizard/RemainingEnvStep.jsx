/**
 * FILE: app/system-setup-wizard/RemainingEnvStep.jsx
 * ROLE: Client Component — Step 5 of the setup wizard
 *
 * PURPOSE:
 * Renders once AdminSetupStep confirms Step 4 (super-admin created).
 * Presence-only checklist for the 8 envGroups.mjs groups not already
 * covered by Step 2 (database, supabase): r2, emailjs, githubActions,
 * rateLimit, geoip, vaultSecurity, aiInsightAndDirections, siteConfig.
 * Together with Step 2, every one of the 10 envGroups.mjs groups is
 * surfaced somewhere in the wizard.
 *
 * Each group's "How do I get these?" panel now shows a clickable link
 * (or links, for groups that touch two providers) straight to the
 * dashboard/signup page, plus a numbered step-by-step list of what to
 * click and which .env key each value goes into — see
 * REMAINING_ENV_HELP below. This content is adapted from the vault
 * dashboard's own API & Service Setup Guide
 * (app/system-vault/[vaultSlug]/ApiSetupGuideSection.jsx) so a
 * first-run developer never has to leave the wizard to get the same
 * walkthrough the vault owner sees later — keep the two in sync when
 * either changes. ENV_FIX_INSTRUCTIONS from scripts/lib/envGroups.mjs
 * is intentionally left untouched here; it stays single-string because
 * scripts/runEnvCheck.js (the nightly cron alert email) still relies
 * on that exact shape.
 *
 * This step has no sequential locking and no "I ran this" checkbox —
 * unlike Step 3's database commands, there's nothing to run in order
 * here, just external dashboard values to paste in. The person can set
 * these in any order, over multiple sessions if needed, since none of
 * them block each other.
 *
 * Also renders <ResellerArchitectureNote /> — a collapsed-by-default,
 * purely informational card on running this template for multiple
 * paying clients from one set of provider accounts. Checks nothing,
 * blocks nothing; see that component's own header for details.
 *
 * DATA FLOW:
 * 1. On mount and on every "Check again" click -> GET
 *    /api/system-setup-wizard/remaining-env-status
 * 2. Response drives the ✓/✕ badge per key, grouped by envGroups.mjs
 *    group id
 * 3. "Continue" is always available (these are external services, not
 *    build-blocking database steps) — hands off to <ScriptsHealthStep />
 *    (Step 6 — scripts & health checks), same hand-off pattern
 *    SetupKeyForm.jsx -> DatabaseSetupStep.jsx -> AdminSetupStep.jsx
 *    already uses
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import ScriptsHealthStep from "./ScriptsHealthStep";
import ResellerArchitectureNote from "./ResellerArchitectureNote";

/**
 * REMAINING_ENV_HELP
 * One entry per group.id from scripts/lib/envGroups.mjs (the 8 groups
 * this step covers). Each entry has the external dashboard/signup
 * link(s) to open and a numbered list of exactly what to click and
 * which .env key the copied value goes into. Content mirrors
 * ApiSetupGuideSection.jsx in the vault dashboard — update both places
 * together if a provider's flow changes.
 */
const REMAINING_ENV_HELP = {
  r2: {
    links: [{ label: "Cloudflare Dashboard", url: "https://dash.cloudflare.com" }],
    note:
      "Free tier: 10 GB storage + 1 million Class A (write/list) ops + 10 million Class B (read) ops per month — egress (serving files to visitors) is always free at any volume. Past the free tier: $0.015/GB-month storage, $4.50 per million Class A ops, $0.36 per million Class B ops. A single resort site rarely gets close to these numbers. This pool is shared across every bucket in the account, not per-bucket — if you later host multiple clients from one Cloudflare account (see \"Reselling this to multiple clients?\" below), all their buckets draw from the same pool; Cloudflare Dashboard → Billing shows current usage any time.",
    steps: [
      "Sign in, then enable R2 Object Storage (needs a payment method on file, but the free tier covers a project this size).",
      "Create a bucket: R2 Object Storage → Create bucket. Enter a name (e.g. villa-azure-resort — this is permanent, it can't be renamed later), leave Location as Automatic and Default Storage Class as Standard, then Create bucket.",
      "Copy the Account ID: R2 Object Storage → Overview → scroll down to Account Details → copy Account ID into CLOUDFLARE_R2_ACCOUNT_ID.",
      "Start the API token: same Account Details section → next to \"API Tokens\" click Manage → Create Account API token (not User API Token — Account tokens keep working even if you ever leave the org).",
      "Set its permissions: Permissions → Object Read & Write. Under \"Specify bucket(s)\" choose \"Apply to specific buckets only\" and select this bucket, so a leaked token can never touch any other bucket. TTL: Forever is fine unless you want it to auto-expire.",
      "Click Create Account API Token, then immediately copy the Access Key ID and Secret Access Key — the secret is shown only once — into CLOUDFLARE_R2_ACCESS_KEY_ID and CLOUDFLARE_R2_SECRET_ACCESS_KEY.",
      "Set CLOUDFLARE_R2_BUCKET_NAME to the exact bucket name from the create-bucket step above.",
      "Make it public: open the bucket → Settings tab → Public Development URL card → Enable.",
      "Copy the pub-....r2.dev URL it gives you (https://, no trailing slash) into NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL. (The Custom Domains card just above it is the production-ready alternative, if you have a domain to connect instead.)",
    ],
  },
  emailjs: {
    links: [{ label: "EmailJS Dashboard", url: "https://dashboard.emailjs.com" }],
    steps: [
      "Sign in, then Account → API Keys.",
      "Copy the Public Key into EMAILJS_PUBLIC_KEY and the Private Key (turn on Strict Mode) into EMAILJS_PRIVATE_KEY.",
      "Email Services → copy your connected service's ID into EMAILJS_SERVICE_ID.",
      "Email Templates → copy the general-purpose template's ID into EMAILJS_GENERAL_TEMPLATE_ID.",
    ],
  },
  githubActions: {
    links: [{ label: "GitHub Personal Access Tokens", url: "https://github.com/settings/tokens" }],
    steps: [
      "Generate new token (classic) — classic, not fine-grained; fine-grained tokens can look fully configured yet silently fail to dispatch the workflow.",
      "Scopes: check BOTH \"repo\" and \"workflow\" — without \"workflow\" the token authenticates but every dispatch call is rejected.",
      "Copy the token (shown once) into GITHUB_ACTIONS_TOKEN.",
      "Set GITHUB_REPO_OWNER and GITHUB_REPO_NAME to match this repository, and GITHUB_WORKFLOW_REF to the branch the workflows live on (currently \"static\").",
    ],
  },
  rateLimit: {
    links: [{ label: "Upstash Console", url: "https://console.upstash.com" }],
    steps: [
      "Create Database → Regional type, region close to where the app is hosted. Free tier is enough for this project.",
      "Open the database → REST API section → copy UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      "No further setup — services/rateLimit.js switches from its in-memory fallback to the distributed limiter automatically once both values are present.",
    ],
  },
  geoip: {
    links: [{ label: "MaxMind GeoLite2 Signup", url: "https://www.maxmind.com/en/geolite2/signup" }],
    steps: [
      "Create a free account, then My Account → Manage License Keys → Generate new license key.",
      "Download GeoLite2 City (the .mmdb file, not the CSV version) from the account's Download Files page.",
      "Save it to services/geoip/GeoLite2-City.mmdb, and set MAXMIND_DB_PATH to that path (default already matches).",
      "Re-download and replace the file periodically — MaxMind refreshes GeoLite2 roughly every 2 weeks.",
    ],
  },
  vaultSecurity: {
    links: [],
    steps: [
      "These are generated locally — no signup needed. Run: node scripts/generateEnvSecret.mjs — prints values for VAULT_SETUP_KEY and CRON_SECRET at once (or pass one name to generate just that key).",
      "VAULT_SETUP_KEY reaches /system-vault-setup even after a full database wipe, when there's no admin session left. Never expires or auto-rotates — treat it like a master password.",
      "CRON_SECRET authenticates the nightly automated call to /api/system-vault-setup/auto-rotate. Update it in BOTH .env.local AND your deployment platform's env vars at the same time — a mismatch fails the cron job silently with a 401.",
      "Set VAULT_OWNER_EMAIL to the email that should receive vault alerts. VAULT_ALERT_WEBHOOK_URL (optional) is a Slack/Discord-style incoming webhook URL, if you want alerts posted to a channel too.",
    ],
  },
  aiInsightAndDirections: {
    links: [
      { label: "Google AI Studio (Gemini)", url: "https://aistudio.google.com/apikey" },
      { label: "Google Cloud Console (Maps + Weather)", url: "https://console.cloud.google.com" },
    ],
    steps: [
      "Gemini: in AI Studio, click \"Get API key\" then \"Create API key\". Import an existing Google Cloud project or create a new one — no billing account required. Copy the key into GEMINI_API_KEY.",
      "Keys created in AI Studio from 2026 onward are auto-restricted — if a key shows \"Unrestricted\" on the API Keys page, click \"Restrict to Gemini API\" (Google rejects unrestricted keys starting June 19, 2026).",
      "GEMINI_MODEL is optional — leave unset to default to gemini-flash-latest.",
      "Maps + Weather: in Cloud Console, use the same project. APIs & Services → Library — enable Geocoding API, Routes API, and Weather API.",
      "APIs & Services → Credentials → Create Credentials → API Key (requires billing enabled, but all three APIs have a free monthly call allowance). Restrict the key to just those three APIs.",
      "One key value works for both GOOGLE_MAPS_API_KEY and GOOGLE_WEATHER_API_KEY — use the same string, or generate two separately restricted keys to track usage independently.",
    ],
  },
  siteConfig: {
    links: [],
    steps: [
      "No signup — this is your own deployed site's URL.",
      "Set NEXT_PUBLIC_SITE_URL to this site's live production URL in .env.local and your deployment platform's env vars.",
      "BASE_URL (optional) only needs setting if a background script needs the site's URL outside the Next.js request context.",
    ],
  },
};

export default function RemainingEnvStep() {
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [openHelpGroupId, setOpenHelpGroupId] = useState(null);
  const [continued, setContinued] = useState(false);

  /**
   * fetchStatus
   * Pulls presence-only status for the 8 remaining envGroups.mjs
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
    return <ScriptsHealthStep />;
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
                {REMAINING_ENV_HELP[group.id]?.links.length > 0 && (
                  <div className="setupWizardInstructionsLinks">
                    {REMAINING_ENV_HELP[group.id].links.map((link) => (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="setupWizardLink"
                      >
                        {link.label} ↗
                      </a>
                    ))}
                  </div>
                )}
                {REMAINING_ENV_HELP[group.id]?.note && (
                  <div className="setupWizardInstructionsNote">{REMAINING_ENV_HELP[group.id].note}</div>
                )}

                <ol className="setupWizardInstructionsList">
                  {REMAINING_ENV_HELP[group.id]?.steps.map((stepText, index) => (
                    <li key={index}>{stepText}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ))}

        <button type="button" className="setupWizardButtonSecondary" onClick={handleCheckAgain}>
          Check again
        </button>
      </div>

      <ResellerArchitectureNote />

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
