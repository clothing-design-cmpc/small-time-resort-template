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
      "Step A — sign in: go to dash.cloudflare.com and sign in (or sign up if you don't have an account — free).",
      "Step B — find R2: left sidebar → scroll down → click \"R2 Object Storage\". First time here, it'll ask you to enable R2 — needs a payment method on file, but the free tier below covers a project this size.",
      "Step C — create the bucket: click \"Create bucket\". Type a name (this is permanent, can't be renamed later — e.g. villa-azure-resort, all lowercase). Leave Location as Automatic and Default Storage Class as Standard. Click \"Create bucket\".",
      "Step D — copy the Account ID: go back to R2 Object Storage → Overview, scroll to \"Account Details\", click the copy icon next to \"Account ID\", paste into CLOUDFLARE_R2_ACCOUNT_ID.",
      "Step E — start the API token: same Account Details section → next to \"API Tokens\" click \"Manage\" → \"Create Account API token\" (must say \"Account\", not \"User\" — Account tokens keep working even if you ever leave the org).",
      "Step F — set permissions: Permissions → Object Read & Write. Under \"Specify bucket(s)\" choose \"Apply to specific buckets only\" and check this bucket, so a leaked token can never touch any other bucket. TTL: Forever is fine unless you want it to auto-expire.",
      "Step G — create and copy: click \"Create Account API Token\". Copy the Access Key ID and Secret Access Key shown immediately — the secret is shown only this once — into CLOUDFLARE_R2_ACCESS_KEY_ID and CLOUDFLARE_R2_SECRET_ACCESS_KEY.",
      "Step H — set the bucket name: CLOUDFLARE_R2_BUCKET_NAME = the exact same name typed in step C.",
      "Step I — make it public: open the bucket → \"Settings\" tab → \"Public Development URL\" card → click \"Enable\".",
      "Step J — copy the public URL: a URL like https://pub-xxxxxxxxxx.r2.dev appears — copy it exactly (https://, no trailing slash) into NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL. (\"Custom Domains\" just above it is the production-ready alternative if you have your own domain to connect instead.)",
    ],
  },
  {
    id: "githubActions",
    label: "3. GitHub — lets the vault trigger backups on demand",
    envVars: ["GITHUB_REPO_OWNER", "GITHUB_REPO_NAME", "GITHUB_ACTIONS_TOKEN", "GITHUB_WORKFLOW_REF"],
    steps: [
      "Step A — go to github.com/settings/tokens while logged in. Click \"Generate new token\" → \"Generate new token (classic)\" specifically, NOT fine-grained (fine-grained tokens can look fully configured yet silently fail to dispatch the workflow).",
      "Step B — name it something recognizable, and set Expiration to \"No expiration\" (or a long date) so the nightly backup doesn't silently stop working later.",
      "Step C — scroll to the scopes checklist: check \"repo\" (auto-checks its sub-items, that's fine), then separately find and check \"workflow\" too — both required, missing \"workflow\" means the token authenticates fine but every dispatch call gets rejected.",
      "Step D — scroll down, click \"Generate token\". Copy the token shown immediately (it's only ever shown once) into GITHUB_ACTIONS_TOKEN.",
      "Step E — set GITHUB_REPO_OWNER and GITHUB_REPO_NAME to match this repo's URL (the two parts right after github.com/), and GITHUB_WORKFLOW_REF to the branch the workflows live on (currently \"static\").",
    ],
  },
  {
    id: "maxmind",
    label: "4. MaxMind GeoIP2 — IP-to-location lookups (self-hosted)",
    envVars: ["MAXMIND_DB_PATH"],
    steps: [
      "Already in this clone — services/geoip/GeoLite2-City.mmdb is committed in this template and MAXMIND_DB_PATH already defaults to that path, so geolocation lookups work out of the box with zero setup.",
      "One file works for every client deployment you resell this to — GeoLite2-City.mmdb is a single worldwide IP-to-location index, not tied to any one client's business address. Reuse the exact same file across all of them; there's no such thing as a \"per-client\" version.",
      "Still worth refreshing periodically — Step A: go to maxmind.com/en/geolite2/signup and create a free account (email + password).",
      "Step B — once logged in: \"My Account\" → \"Manage License Keys\" → \"Generate new license key\" (this just unlocks the download below, no need to copy it anywhere).",
      "Step C — \"Download Files\" (same account menu) → find \"GeoLite2 City\" → download the \".mmdb\" version specifically, not the \".csv\" one (different format the app can't read).",
      "Step D — unzip the download, rename the file inside to exactly GeoLite2-City.mmdb if it isn't already, and replace the existing file at services/geoip/GeoLite2-City.mmdb with it — MaxMind updates GeoLite2 roughly every 2 weeks, and the committed copy only gets staler the longer it sits.",
    ],
  },
  {
    id: "upstash",
    label: "5. Upstash Redis — distributed rate limiting",
    envVars: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    steps: [
      "Step A — go to console.upstash.com, click \"Sign in\", then \"Continue with Google\" and log in with your Gmail account.",
      "Step B — left sidebar → click \"Redis\" (Upstash's Redis product page, empty the first time).",
      "Step C — click \"Create Database\". Name it, set Type to \"Regional\" (not Global).",
      "Step D — before clicking Create, open your Supabase Dashboard in another tab → Settings → General, note the \"Region\" shown there. Back in Upstash, set the \"Primary Region\" dropdown to that exact same region — keeps Redis and Postgres colocated so rate-limit checks don't add cross-region delay. Free tier is enough for this project.",
      "Step E — click \"Create\". Ready almost instantly.",
      "Step F — click into the database → find \"REST API\" section → copy UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN into .env.local.",
      "No further setup — services/rateLimit.js switches from its in-memory fallback to the distributed limiter automatically once both values are present and the server restarts.",
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
      "Maps + Weather, step E — enable each API one at a time: in the Library's search box, type the exact name below, click the matching result card, then click the blue \"Enable\" button on that page. If this project has no billing account linked yet, clicking Enable redirects you to a full \"Create a new billing account\" page instead of a simple dropdown — even if you already have a billing account on file from another project, Google doesn't offer to reuse it here. On that page: the \"Name\" field is pre-filled (e.g. \"My Maps Billing Account 1\") — leave it as-is or rename it, doesn't matter functionally. \"Country\" is usually already correct; \"Currency\" is set automatically based on that country and can't be changed. Click \"Continue\", then on the next screen enter a real card's details to finish creating the billing account — this does not charge the card, it just puts one on file as required before Google unlocks these paid-tier APIs; all four have a free monthly allowance well above what this project needs. Once that's done, you're automatically brought back to finish enabling the API you clicked. Then repeat for all FOUR names: \"Geocoding API\", \"Maps Static API\", \"Routes API\", \"Weather API\" (only the very first one triggers the billing account creation — the rest enable instantly once billing exists). Maps Static API is the easiest one to forget since nothing else on this page reminds you about it — skipping it won't show any error anywhere, it just means the little map picture on /visitor/directions never shows up. Do this step BEFORE step F below — creating the key first, with nothing enabled yet, causes a \"No APIs selected\" / \"API selection required\" error when you try to save it.",
      "Maps + Weather, step F — create the API key: click ☰ → \"APIs & Services\" → \"Credentials\" (right above \"Library\" in that same submenu). Click the blue \"+ Create Credentials\" button near the top, then click \"API key\" from the dropdown that appears. A panel slides in from the right showing a \"Name\" field (leave the default \"API key 1\" or rename it) — don't click Create yet, the next step still needs to happen on this same panel.",
      "Maps + Weather, step G — restrict the key: on that same panel, find \"Select API restrictions\" (currently says \"No APIs selected\") and click it — a checklist of every API enabled on this project appears (this list is empty and unusable if step E wasn't done first). Check the box next to all four: Geocoding, Maps Static, Routes, Weather. Unlike older Google Cloud versions, this Cloud Console no longer offers an \"unrestricted\"/\"don't restrict\" option — at least one API must be checked here or clicking Create fails with a red \"API selection required\" error. Scroll down past \"Application restrictions\" (leave it on \"None\" — that setting is for browser/app-level limits, separate from the API checklist above) and click \"Create\".",
      "Maps + Weather, step H — copy the key: clicking \"Create\" in step G takes you straight back to the Credentials page, where your new key (named \"Maps Platform API Key\" or whatever you typed) now shows up in the \"API keys\" list with a green checkmark, today's creation date, and \"4 APIs\" under Restrictions. There's no copy icon directly in that row — under the \"Actions\" column on the right, click \"Show key\". A popup opens showing the full key text in a box with a small copy icon next to it (hover over it, it says \"Copy to clipboard\") — click that icon, then paste into both GOOGLE_MAPS_API_KEY and GOOGLE_WEATHER_API_KEY. Click \"Close\" when done.",
      "To find this same key again later (a new day, a different browser tab, whatever): go to console.cloud.google.com → click the ☰ menu icon top-left → \"APIs & Services\" → \"Credentials\" → your key is listed under \"API keys\" → \"Show key\" under Actions reopens the same copy popup from step H.",
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
