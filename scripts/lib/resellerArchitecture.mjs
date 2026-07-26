/**
 * FILE: scripts/lib/resellerArchitecture.mjs
 * PURPOSE:
 * Reference-only notes for running this template as a "one master
 * account, isolated child resources per client" reseller setup — one
 * login per provider, but a separate, non-overlapping resource per
 * client underneath it. Nothing here is enforced by code; it's
 * guidance surfaced in the setup wizard (RemainingEnvStep.jsx via
 * ResellerArchitectureNote.jsx) for whoever is deploying this
 * template on behalf of a paying client rather than for themselves.
 *
 * Only relevant once more than one client is being hosted from the
 * same provider accounts — a single-deployment setup can ignore this
 * entirely, which is why it's collapsed by default wherever it's
 * shown.
 *
 * Keyed loosely by envGroups.mjs group id where a direct match
 * exists (supabase, r2, emailjs, githubActions, rateLimit, geoip,
 * aiInsightAndDirections) plus two extra keys — "github" (creating
 * the per-client repo itself, not an env var) and "hosting"
 * (Vercel/deployment project + custom domain) — that fall outside
 * any env group but are part of the same isolation pattern.
 */
export const RESELLER_ARCHITECTURE_NOTES = {
  github:
    "One GitHub account/org. Mark the master repo as a Template Repository (Settings → Template repository). Per client: \"Use this template\" → new private repo named resort-{clientslug} — no shared history, no \"forked from\" link.",
  supabase:
    "One Supabase account, but a separate Project per client — never one shared/multi-tenant project (this template's admin/vault design is single-owner per deployment). Free tier covers 2 projects; a Pro org plan (~$25/mo) is needed beyond that. Each project has its own DATABASE_URL, DIRECT_URL, and API keys.",
  r2: "One Cloudflare account, but a separate bucket per client, with an API token scoped to only that bucket (R2 supports per-bucket-scoped tokens) — a leaked client token still can't reach another client's bucket. Billing note: the 10 GB / 1M-write / 10M-read free tier is shared across the whole account, not per bucket, so it's split between every client's bucket combined.",
  emailjs:
    "One EmailJS account, but a separate Email Service (and Service ID) per client — the client's own inbox can be connected as the sending address while it stays under your account. Duplicate BOTH templates (general + booking) per client and note both new Template IDs.",
  githubActions:
    "Same GitHub account as above — the token this client's workflow uses only needs access to that client's own repo, not your whole org.",
  rateLimit:
    "One Upstash account, but a separate Redis database per client (free tier allows many small databases), so rate-limit counters never mix between clients.",
  geoip:
    "Not per-client — MaxMind is a one-time download under one account. The same GeoLite2-City.mmdb file is copied into every client's project.",
  aiInsightAndDirections:
    "One Google Cloud account/billing, but a separate API key per client, restricted by HTTP referrer to that client's own domain — a leaked key still can't be used on another client's site.",
  hosting:
    "One Vercel account, but a separate Vercel project per client. The client's custom domain is added under that project (Project → Domains) — env vars and deploy logs stay isolated per client.",
};

/**
 * RESELLER_PROVIDERS
 * Ordered, structured version of the same reference material — each
 * provider's step-by-step setup instructions plus a copyable resource
 * naming pattern (using {clientslug} as the placeholder) where one
 * applies. This is what ResellerArchitectureNote.jsx renders; the
 * shorter RESELLER_ARCHITECTURE_NOTES above stays as a plain-text
 * one-liner per provider for anywhere only a short summary fits.
 *
 * NOTE: scripts/setup-guide.html is a standalone offline file (opened
 * via file://, so it can't import this ES module — browsers block
 * module imports over file://) and keeps its own hardcoded copy of
 * this same content in its STEP_DATA array. Keep the two in sync by
 * hand when this list changes.
 */
export const RESELLER_PROVIDERS = [
  {
    id: "github",
    name: "GitHub",
    steps: [
      "Open the master repo → Settings → General → check \u201cTemplate repository\u201d.",
      "For each new client, click \u201cUse this template\u201d → \u201cCreate a new repository\u201d.",
      "Name it with the pattern below, set it Private, create it. No shared history, no \u201cforked from\u201d link.",
    ],
    pattern: "resort-{clientslug}",
  },
  {
    id: "supabase",
    name: "Supabase",
    steps: [
      "Dashboard → New Project (never reuse an existing project across clients — this template is single-owner per deployment).",
      "Name it with the pattern below, pick the region closest to the client, set a strong DB password and save it.",
      "Click the green Connect button on the project page → Connection Method → Transaction pooler → copy the URI into DATABASE_URL, then switch to Session pooler → copy the URI into DIRECT_URL.",
      "Settings → API Keys → copy the Project URL into NEXT_PUBLIC_SUPABASE_URL. Switch to the Legacy anon, service_role API keys tab, then copy the anon key into NEXT_PUBLIC_SUPABASE_ANON_KEY and the service_role key into SUPABASE_SERVICE_ROLE_KEY.",
    ],
    pattern: "{clientslug}-resort",
  },
  {
    id: "r2",
    name: "Cloudflare R2",
    steps: [
      "R2 → Create bucket, named with the pattern below.",
      "Account Details (on the R2 Overview page) → API Tokens → Manage → Create Account API token → Object Read & Write → under \"Specify bucket(s)\" choose \"Apply to specific buckets only\" and pick only this client's bucket.",
      "Copy the Account ID, Access Key ID, and Secret Access Key into this client's .env.local.",
      "Bucket → Settings → Public Development URL card → Enable (or connect a Custom Domain instead), then copy that URL into NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL.",
      "Billing: the 10 GB storage / 1M write / 10M read free tier is account-wide, shared across every client bucket combined — it's not reset per client, so watch cumulative usage as you add more clients (Cloudflare Dashboard → Billing).",
    ],
    pattern: "{clientslug}-assets",
  },
  {
    id: "emailjs",
    name: "EmailJS",
    steps: [
      "Email Services → Add New Service → connect the client's own inbox (or yours), named with the pattern below.",
      "Email Templates → duplicate BOTH base templates (general + booking) for this client, note both new Template IDs.",
      "Copy the Service ID, both Template IDs (EMAILJS_GENERAL_TEMPLATE_ID and EMAILJS_BOOKING_TEMPLATE_ID), Public Key, and Private Key into this client's .env.local.",
    ],
    pattern: "{clientslug}-service",
  },
  {
    id: "githubActions",
    name: "GitHub Actions",
    steps: [
      "In the client's own repo → Settings → Secrets and variables → Actions → add the same secret names the master repo uses.",
      "GitHub → Settings → Developer settings → Personal access tokens → generate a token scoped to only this repo (repo + workflow) — never your whole org.",
    ],
    pattern: null,
  },
  {
    id: "rateLimit",
    name: "Upstash Redis",
    steps: [
      "Console → Create Database, named with the pattern below, region closest to the deployment.",
      "REST API tab → copy UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN into this client's .env.local.",
    ],
    pattern: "{clientslug}-ratelimit",
  },
  {
    id: "geoip",
    name: "MaxMind GeoIP",
    steps: [
      "One-time only, not per-client — download GeoLite2-City.mmdb once from your existing MaxMind account.",
      "Copy that same file into every client project at services/geoip/GeoLite2-City.mmdb.",
    ],
    pattern: null,
  },
  {
    id: "aiInsightAndDirections",
    name: "Google (Gemini / Maps / Weather)",
    steps: [
      "Google Cloud Console → APIs & Services → Credentials → Create API Key for this client.",
      "Restrict the key → HTTP referrers → add only this client's domain.",
      "Enable the Geocoding API, Routes API, Weather API, and Gemini API for this key.",
    ],
    pattern: null,
  },
  {
    id: "hosting",
    name: "Vercel / hosting",
    steps: [
      "New Project → import the client's own repo (see the GitHub pattern above).",
      "Project Settings → Environment Variables → add every key from this client's .env.local.",
      "Project → Domains → add the client's custom domain, then hand them the CNAME/A record to set at their registrar.",
    ],
    pattern: "resort-{clientslug}",
  },
];

/**
 * RESELLER_NAMING_TIP
 * The one cross-cutting practice worth repeating everywhere above:
 * a consistent {clientslug} across every service's resource name
 * makes onboarding and offboarding a client a matter of finding and
 * deleting a handful of predictably-named resources, never a search.
 */
export const RESELLER_NAMING_TIP =
  "Use one consistent {clientslug} across every service — repo name, Supabase project name, R2 bucket name, Upstash database name, Vercel project name. Offboarding a client that stops renting is then just deleting the handful of resources with that slug, with nothing else affected.";
