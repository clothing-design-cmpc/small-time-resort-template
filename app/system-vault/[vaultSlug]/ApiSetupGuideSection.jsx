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
    steps: [
      "Go to dash.cloudflare.com, enable R2 Object Storage (needs a payment method on file, but the free tier covers a project this size).",
      "Free tier: 10 GB storage + 1 million Class A (write/list) + 10 million Class B (read) operations per month, account-wide — not per bucket. Egress (serving files to visitors) is always free at any volume. Past the free tier: $0.015/GB-month storage, $4.50 per million Class A ops, $0.36 per million Class B ops.",
      "Create a bucket (e.g. villa-azure-resort), default region.",
      "Copy the Account ID from the R2 Overview page into CLOUDFLARE_R2_ACCOUNT_ID.",
      "Manage R2 API Tokens → Create API Token (Object Read & Write, scoped to your bucket). Copy the Access Key ID and Secret Access Key immediately — the secret is shown only once.",
      "Set CLOUDFLARE_R2_BUCKET_NAME to the exact bucket name.",
      "Bucket → Settings → Public Access → Allow Access. Use the r2.dev URL or connect a custom domain, then copy that public URL (https://, no trailing slash) into NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL.",
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
      "maxmind.com/en/geolite2/signup — create a free account, then My Account → Manage License Keys → Generate new license key.",
      "Download GeoLite2 City (the .mmdb file, not the CSV version) from the account's Download Files page.",
      "Save it to services/geoip/GeoLite2-City.mmdb, and set MAXMIND_DB_PATH to that path.",
      "Re-download and replace the file periodically — MaxMind refreshes GeoLite2 roughly every 2 weeks.",
    ],
  },
  {
    id: "upstash",
    label: "5. Upstash Redis — distributed rate limiting",
    envVars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    steps: [
      "console.upstash.com — Create Database, Regional type, region close to where the app is hosted. Free tier is enough for this project.",
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
      "Keys created in AI Studio from 2026 onward are auto-restricted (\"Auth keys\") — if the key shows an \"Unrestricted\" tag on the API Keys page, click \"Restrict to Gemini API\" (Google rejects unrestricted keys starting June 19, 2026).",
      "GEMINI_MODEL is optional — leave unset to default to gemini-flash-latest, or set it to pin a specific model.",
      "Google Maps + Weather: go to console.cloud.google.com, use the same project (or a new one). APIs & Services → Library — enable Geocoding API, Routes API, and Weather API.",
      "APIs & Services → Credentials → Create Credentials → API Key. This requires billing enabled on the Cloud project, but all three APIs have a free monthly call allowance — you won't be charged unless you exceed it.",
      "Restrict the key to just those three APIs (API restrictions, not \"Don't restrict key\").",
      "One key value works for both GOOGLE_MAPS_API_KEY and GOOGLE_WEATHER_API_KEY — set them to the same string, or generate two separate restricted keys if you'd rather track their usage independently.",
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
