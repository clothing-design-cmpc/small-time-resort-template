/**
 * FILE: app/system-vault/[vaultSlug]/ApiSetupGuideSection.jsx
 * ROLE: Rendered inside RecoveryClient.jsx only, directly above
 *       EnvCheckerSection — this is the "how to set it up" guide,
 *       EnvCheckerSection is the "is it set up yet" checker. Together
 *       they cover both halves of Task 3.
 *
 * PURPOSE:
 * Static, in-app reference for every external service this project
 * depends on (Supabase, Cloudflare R2, GitHub Actions,
 * MaxMind GeoIP2, Upstash Redis, EmailJS, Gemini + Google Maps Platform,
 * and the seed admin account) — one collapsible card per service with the
 * exact step-by-step sign-up/configuration instructions and which
 * .env keys each step fills in. Content mirrors the project's own
 * external-services setup guide so a new developer never has to go
 * hunting for a separate document — it's one click away on the vault
 * dashboard they already have to visit to run the Environment Check.
 *
 * Purely static content — no API call, nothing to fetch. Renders
 * client-side only because it manages its own accordion open/close
 * state.
 *
 * DATA FLOW:
 * 1. Owner opens the vault dashboard
 * 2. Clicks a service name to expand its steps
 * 3. Cross-references the env var names shown here against
 *    EnvCheckerSection's live "Set / Missing" report just below
 */
"use client";

import { useState } from "react";
import "./ApiSetupGuideSection.css";

// One entry per external service/secret this project depends on.
// envVars are shown for cross-reference against EnvCheckerSection's
// own report — this list intentionally is NOT imported from
// scripts/lib/envGroups.mjs, since a couple of groups here (the
// onboarding link, the locally-generated secrets) aren't .env-driven
// checks at all, just setup steps.
const SETUP_GUIDE_SECTIONS = [
  {
    id: "onboarding",
    label: "0. Onboarding Link (optional, one-time-use)",
    envVars: [],
    steps: [
      "Make sure DATABASE_URL / DIRECT_URL are already set in .env.local (see the Database section below).",
      "Run: node scripts/generateOnboardingToken.mjs",
      "Copy the printed URL (https://yourdomain.com/system-vault-setup?key=...) — it is shown only once and expires after 48 hours or after first use.",
      "Open that link in a browser to go straight to /system-vault-setup without needing an admin session yet.",
      "This is NOT the same secret as VAULT_SETUP_KEY below — never substitute one for the other.",
    ],
  },
  {
    id: "secrets",
    label: "0.5 VAULT_SETUP_KEY & CRON_SECRET (generated locally, no signup)",
    envVars: ["VAULT_SETUP_KEY", "CRON_SECRET"],
    steps: [
      "Run: node scripts/generateEnvSecret.mjs — prints both values at once (or pass VAULT_SETUP_KEY / CRON_SECRET as an argument to generate just one).",
      "VAULT_SETUP_KEY: the env-only master key that reaches /system-vault-setup even after a full database wipe, when there's no admin session left. Never expires or auto-rotates — treat it like a master password.",
      "CRON_SECRET: authenticates Vercel Cron's daily call to /api/system-vault-setup/auto-rotate. Update it in BOTH .env.local AND the deployment's env vars at the same time — a mismatch makes the cron job fail silently with a 401.",
    ],
  },
  {
    id: "gatekeeperHash",
    label: "0.6 GATEKEEPER_VAULT_PASSPHRASE_HASH (generated locally, no signup)",
    envVars: ["GATEKEEPER_VAULT_PASSPHRASE_HASH"],
    steps: [
      'Run: node scripts/hashGatekeeperVaultPassphrase.js "your-chosen-passphrase"',
      "Copy the printed GATEKEEPER_VAULT_PASSPHRASE_HASH=... line into .env.local and the deployment's env vars.",
      "Gates the hidden Gatekeeper Tester page — its URL slug is derived from this hash and changes automatically whenever it's regenerated.",
      "Different secret from VAULT_SETUP_KEY above — never reuse one for the other. Losing the plaintext just means re-running the script with a new passphrase.",
    ],
  },
  {
    id: "supabase",
    label: "1. Supabase — Database (Postgres) + Auth",
    envVars: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "DATABASE_URL",
      "DIRECT_URL",
    ],
    steps: [
      "Go to supabase.com and sign in / create an account.",
      "Click \"New Project\". Name it, set a strong database password (save it — needed for DATABASE_URL/DIRECT_URL), pick a nearby region, wait ~2 minutes for provisioning.",
      "Project Settings → Data API: copy Project URL, anon public key, and service_role key into NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY (server-side only — never NEXT_PUBLIC_).",
      "Project Settings → Database → Connection string: copy the Transaction Pooler string into DATABASE_URL and the Session Pooler string into DIRECT_URL, replacing [YOUR-PASSWORD] in both.",
      "Run: npx prisma db push, then npx prisma generate, then npx prisma db seed to create the tables and seed data.",
    ],
  },
  {
    id: "r2",
    label: "2. Cloudflare R2 — Image & file storage (CDN)",
    envVars: [
      "CLOUDFLARE_R2_ACCOUNT_ID",
      "CLOUDFLARE_R2_ACCESS_KEY_ID",
      "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
      "CLOUDFLARE_R2_BUCKET_NAME",
      "NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL",
    ],
    note:
      "Free tier: 10 GB storage + 1 million Class A (write/list) ops + 10 million Class B (read) ops per month, account-wide — not per bucket. Egress (serving files to visitors) is always free at any volume. Past the free tier: $0.015/GB-month storage, $4.50 per million Class A ops, $0.36 per million Class B ops. A payment method on file is required to enable R2, but a single resort site rarely comes close to these limits.",
    steps: [
      "Go to dash.cloudflare.com and enable R2 Object Storage.",
      "Create a bucket: R2 Object Storage → Create bucket. Name it (e.g. villa-azure-resort — permanent, can't be renamed later), leave Location as Automatic and Default Storage Class as Standard, then Create bucket.",
      "Copy the Account ID: R2 Object Storage → Overview → Account Details → copy Account ID into CLOUDFLARE_R2_ACCOUNT_ID.",
      "Start the API token: same Account Details section → next to \"API Tokens\" click Manage → Create Account API token (not User API Token — Account tokens keep working even if you ever leave the org).",
      "Set its permissions: Permissions → Object Read & Write. Under \"Specify bucket(s)\" choose \"Apply to specific buckets only\" and select this bucket, so a leaked token can never touch any other bucket. TTL: Forever is fine unless you want it to auto-expire.",
      "Click Create Account API Token, then immediately copy the Access Key ID and Secret Access Key — the secret is shown only once — into CLOUDFLARE_R2_ACCESS_KEY_ID and CLOUDFLARE_R2_SECRET_ACCESS_KEY.",
      "Set CLOUDFLARE_R2_BUCKET_NAME to the exact bucket name from the create-bucket step above.",
      "Make it public: open the bucket → Settings tab → Public Development URL card → Enable.",
      "Copy the pub-....r2.dev URL it gives you (https://, no trailing slash) into NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL. (The Custom Domains card just above it is the production-ready alternative, if you have a domain to connect instead.)",
    ],
  },
  {
    id: "githubActions",
    label: "3. GitHub — lets the vault trigger backups on demand",
    envVars: ["GITHUB_REPO_OWNER", "GITHUB_REPO_NAME", "GITHUB_ACTIONS_TOKEN", "GITHUB_WORKFLOW_REF"],
    steps: [
      "github.com/settings/tokens → Generate new token (classic). Classic, not fine-grained — fine-grained tokens can look fully configured yet silently fail to dispatch the workflow.",
      "Scopes: check BOTH \"repo\" and \"workflow\" — without \"workflow\" the token can authenticate but every dispatch call is rejected.",
      "Copy the token (shown once) into GITHUB_ACTIONS_TOKEN.",
      "Set GITHUB_REPO_OWNER and GITHUB_REPO_NAME to match the repo URL, and GITHUB_WORKFLOW_REF to the branch the workflows live on (currently \"static\").",
    ],
  },
  {
    id: "maxmind",
    label: "4. MaxMind GeoIP2 — IP-to-location lookups (self-hosted)",
    envVars: ["MAXMIND_DB_PATH"],
    steps: [
      "Already in this clone — services/geoip/GeoLite2-City.mmdb is committed in this template and MAXMIND_DB_PATH already defaults to that path, so geolocation lookups work out of the box with zero setup.",
      "One file works for every client deployment you resell this to — GeoLite2-City.mmdb is a single worldwide IP-to-location index, not tied to any one client's business address. Reuse the exact same file across all of them; there's no such thing as a \"per-client\" version.",
      "Still worth refreshing periodically: maxmind.com/en/geolite2/signup — create a free account, then My Account → Manage License Keys → Generate new license key.",
      "Download GeoLite2 City (the .mmdb file, not the CSV version) from the account's Download Files page.",
      "Replace services/geoip/GeoLite2-City.mmdb with the fresh download — MaxMind updates GeoLite2 roughly every 2 weeks, and the committed copy only gets staler the longer it sits.",
    ],
  },
  {
    id: "upstash",
    label: "5. Upstash Redis — distributed rate limiting",
    envVars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    steps: [
      "console.upstash.com — sign in with your Google/Gmail account.",
      "Create Database → Regional type. For Primary Region, pick the same region as your Supabase project (Supabase Dashboard → Settings → General → Region) — keeps Redis and Postgres colocated so rate-limit checks don't add cross-region latency. Free tier is enough for this project.",
      "Open the database → REST API section → copy UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      "No further setup — services/rateLimit.js switches from its in-memory fallback to the distributed limiter automatically once both values are present.",
    ],
  },
  {
    id: "aiInsightAndDirections",
    label: "6. Gemini + Google Maps Platform — AI Sales Insight & Directions",
    envVars: ["GEMINI_API_KEY", "GEMINI_MODEL", "GOOGLE_MAPS_API_KEY", "GOOGLE_WEATHER_API_KEY"],
    steps: [
      "Gemini: go to aistudio.google.com, sign in, click \"Get API key\" in the left sidebar, then \"Create API key\". Import an existing Google Cloud project or create a new one — no billing account required. Copy the key into GEMINI_API_KEY.",
      "Keys created in AI Studio in 2026 are auth keys by default — they start with \"AQ.\" instead of the older \"AIza\" prefix and are already scoped to the Gemini API, so no extra restriction step is needed. If your key still starts with \"AIza\" (an older standard key), Google now rejects unrestricted standard keys outright — go to the API Keys page, and if it shows an \"Unrestricted\" tag, click \"Restrict to Gemini API\" immediately. Standard keys stop working entirely in September 2026, so an AIza key should be treated as temporary either way — regenerate a fresh AQ. key if you can.",
      "GEMINI_MODEL is optional — leave unset to default to gemini-flash-latest, or set it to pin a specific model.",
      "Maps + Weather, step A — pick the right project: at console.cloud.google.com, look at the very top of the page, next to the \"Google Cloud\" logo, there's a small dropdown showing a project name. Click it and pick the SAME project you used for Gemini above (don't create a new one — one project, one bill, less to manage).",
      "Maps + Weather, step B — open the Maps Platform setup page: in the search bar at the top of the page, type \"Google Maps Platform\" and click the first result. If you land on a page titled \"Welcome, [your name]\" with questions like \"What's your industry of focus?\" — that's just Google asking for its own recommendations, not something this project needs. Click \"Skip for now\" (small link near the top of that popup) to close it. If it doesn't appear at all, that's fine too — continue to the next step.",
      "Maps + Weather, step C — the \"prepayment\" banner: you'll likely see an orange/yellow bar near the top saying something like \"Your free trial requires a prepayment.\" This just means Google needs a valid card on file before it lets you turn on paid-tier APIs — it will NOT charge that card unless you go far over the free monthly usage this project needs. Click the \"Make a payment\" (or \"Link a billing account\") button on that same bar, then follow Google's on-screen form: enter your card details, confirm, done. If the banner isn't there, billing may already be linked — skip to the next step.",
      "Maps + Weather, step D — open the API Library: click the ☰ menu icon at the very top-left of the page → scroll down and click \"APIs & Services\" → click \"Library\" (it's the second item in that submenu, right under \"Enabled APIs & services\").",
      "Maps + Weather, step E — enable each API one at a time: in the Library's search box, type the exact name below, click the matching result card, then click the blue \"Enable\" button on that page. Wait for it to finish (a few seconds), then click the browser's back button (or search again) to enable the next one. Repeat for all FOUR names: \"Geocoding API\", \"Maps Static API\", \"Routes API\", \"Weather API\". Maps Static API is the easiest one to forget since nothing else on this page reminds you about it — skipping it won't show any error anywhere, it just means the little map picture on /visitor/directions never shows up.",
      "Maps + Weather, step F — create the API key: click ☰ → \"APIs & Services\" → \"Credentials\" (right above \"Library\" in that same submenu). Click the blue \"+ Create Credentials\" button near the top, then click \"API key\" from the dropdown that appears. A popup shows your new key immediately — don't close it yet, but you also don't need to copy it from this exact popup; you can always come back to it (next step explains where).",
      "Maps + Weather, step G — restrict the key: on that same popup (or if you closed it, click the new key's name in the Credentials list to reopen it), scroll down to \"Select API restrictions\" and choose \"Restrict key\" (not \"Don't restrict key\" — leaving it unrestricted is a security risk since anyone who gets the key text could use it under your billing). A checklist of APIs appears — check the box next to all four you enabled in step E: Geocoding, Maps Static, Routes, Weather. Scroll down and click \"Save\".",
      "Maps + Weather, step H — copy the key: on the Credentials page, find your key in the list and click the small copy icon next to it (or click the key's name to open it, then click \"Show key\" and copy from there).",
      "One key value works for both GOOGLE_MAPS_API_KEY and GOOGLE_WEATHER_API_KEY — paste the exact same copied string into both, or repeat steps F–H a second time to generate two separately-restricted keys if you'd rather track each API's usage independently.",
    ],
  },
  {
    id: "seedAdmin",
    label: "7. Seed Admin Account — local config, no signup",
    envVars: ["SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD"],
    steps: [
      "Pick any email/password — these become the first super-admin login credentials.",
      "Created when npx prisma db seed runs (Supabase step above) — log in with them at /superAdmin/login afterward.",
    ],
  },
];

export default function ApiSetupGuideSection() {
  // Tracks which single card is expanded — null means all collapsed.
  // One-open-at-a-time keeps a 10-service list scannable instead of
  // becoming one long wall of text.
  const [openSectionId, setOpenSectionId] = useState(null);

  function toggleSection(id) {
    setOpenSectionId((current) => (current === id ? null : id));
  }

  return (
    <div className="recoveryStepCard">
      <h2>API &amp; Service Setup Guide</h2>
      <p>
        Step-by-step instructions for every external service this project depends on — which
        website to sign up on, what to click, and exactly which .env key each value goes into.
        Use the Environment Check card below to confirm whether a given key has actually been set.
      </p>

      <div className="apiSetupGuideList">
        {SETUP_GUIDE_SECTIONS.map((section) => {
          const isOpen = openSectionId === section.id;
          return (
            <div key={section.id} className="apiSetupGuideCard">
              <button
                type="button"
                className="apiSetupGuideCardHeader"
                onClick={() => toggleSection(section.id)}
                aria-expanded={isOpen}
              >
                <span>{section.label}</span>
                <span className="apiSetupGuideChevron" aria-hidden="true">
                  {isOpen ? "−" : "+"}
                </span>
              </button>

              {isOpen && (
                <div className="apiSetupGuideCardBody">
                  {section.envVars.length > 0 && (
                    <ul className="apiSetupGuideEnvVarList">
                      {section.envVars.map((envVar) => (
                        <li key={envVar} className="adminMono">
                          {envVar}
                        </li>
                      ))}
                    </ul>
                  )}

                  {section.note && <div className="apiSetupGuideNote">{section.note}</div>}

                  <ol className="apiSetupGuideSteps">
                    {section.steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
