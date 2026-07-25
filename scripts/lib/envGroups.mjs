/**
 * FILE: scripts/lib/envGroups.mjs
 * PURPOSE:
 * Single source of truth for the full spec of env vars this app needs,
 * grouped by the service/feature each one powers. `required: false`
 * entries are optional or CI/script-only knobs — flagged as
 * informational, never as an error.
 *
 * WHY THIS LIVES HERE (not inline in services/envCheck.js):
 * This is a plain data file with zero imports, so it can be loaded two
 * ways without conflict:
 *   1. services/envCheck.js imports it via the "@/" alias (Next.js
 *      bundler resolves this fine) — powers the on-demand "Run
 *      Environment Check" button on the vault dashboard.
 *   2. scripts/runEnvCheck.js imports it via a relative path — this
 *      runs as a plain `node` process (GitHub Actions nightly cron),
 *      where the "@/" alias does NOT resolve (that's a Next.js/
 *      TypeScript-only convenience, not a Node.js one).
 * Keeping the spec in one file means both the manual dashboard check
 * and the automated nightly check always agree on what "configured"
 * means — nobody has to remember to update two copies of this list.
 */
export const ENV_GROUPS = [
  {
    id: "database",
    label: "Database (Prisma / Supabase Postgres)",
    keys: [
      { key: "DATABASE_URL", required: true },
      { key: "DIRECT_URL", required: true },
    ],
  },
  {
    id: "supabase",
    label: "Supabase (Auth + client)",
    keys: [
      { key: "NEXT_PUBLIC_SUPABASE_URL", required: true },
      { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true },
      { key: "SUPABASE_SERVICE_ROLE_KEY", required: true },
    ],
  },
  {
    id: "r2",
    label: "Cloudflare R2 (image/asset storage)",
    keys: [
      { key: "CLOUDFLARE_R2_ACCOUNT_ID", required: true },
      { key: "CLOUDFLARE_R2_ACCESS_KEY_ID", required: true },
      { key: "CLOUDFLARE_R2_SECRET_ACCESS_KEY", required: true },
      { key: "CLOUDFLARE_R2_BUCKET_NAME", required: true },
      { key: "NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL", required: true },
    ],
  },
  {
    id: "googleDrive",
    label: "Google Drive (document backups + restore)",
    keys: [
      { key: "GOOGLE_OAUTH_CLIENT_ID", required: true },
      { key: "GOOGLE_OAUTH_CLIENT_SECRET", required: true },
      { key: "GOOGLE_OAUTH_REFRESH_TOKEN", required: true },
      { key: "GOOGLE_DRIVE_FOLDER_ID", required: true },
    ],
  },
  {
    id: "emailjs",
    label: "EmailJS (OTP + alert emails)",
    keys: [
      { key: "EMAILJS_SERVICE_ID", required: true },
      { key: "EMAILJS_GENERAL_TEMPLATE_ID", required: true },
      { key: "EMAILJS_PUBLIC_KEY", required: true },
      { key: "EMAILJS_PRIVATE_KEY", required: true },
    ],
  },
  {
    id: "githubActions",
    label: "GitHub Actions (backup/restore pipeline)",
    keys: [
      { key: "GITHUB_ACTIONS_TOKEN", required: true },
      { key: "GITHUB_REPO_OWNER", required: true },
      { key: "GITHUB_REPO_NAME", required: true },
      { key: "GITHUB_WORKFLOW_REF", required: false },
    ],
  },
  {
    id: "rateLimit",
    label: "Upstash Redis (rate limiting)",
    keys: [
      { key: "UPSTASH_REDIS_REST_URL", required: true },
      { key: "UPSTASH_REDIS_REST_TOKEN", required: true },
    ],
  },
  {
    id: "geoip",
    label: "MaxMind GeoIP (security log location lookup)",
    keys: [{ key: "MAXMIND_DB_PATH", required: true }],
  },
  {
    id: "vaultSecurity",
    label: "Vault & Gatekeeper security",
    keys: [
      { key: "VAULT_SETUP_KEY", required: true },
      { key: "WIZARD_SETUP_KEY", required: true },
      { key: "VAULT_OWNER_EMAIL", required: true },
      { key: "VAULT_ALERT_WEBHOOK_URL", required: false },
      { key: "GATEKEEPER_VAULT_PASSPHRASE_HASH", required: false },
      { key: "VAULT_PASSPHRASE_HASH", required: false },
      { key: "CRON_SECRET", required: true },
      { key: "SECURITY_LOG_RETENTION_DAYS", required: false },
      { key: "GATEKEEPER_IP_BLOCK_ENABLED", required: false },
    ],
  },
  {
    id: "aiInsightAndDirections",
    label: "AI Sales Insight & Directions (Gemini + Google Maps Platform)",
    keys: [
      { key: "GEMINI_API_KEY", required: true },
      { key: "GEMINI_MODEL", required: false },
      { key: "GOOGLE_MAPS_API_KEY", required: true },
      { key: "GOOGLE_WEATHER_API_KEY", required: true },
    ],
  },
  {
    id: "siteConfig",
    label: "Site configuration",
    keys: [
      { key: "NEXT_PUBLIC_SITE_URL", required: true },
      { key: "BASE_URL", required: false },
    ],
  },
];

/**
 * ENV_FIX_INSTRUCTIONS
 * One short, concrete fix step per group — keyed by group id above.
 * Used by scripts/runEnvCheck.js to tell the vault owner exactly what
 * to do in the alert email, instead of just naming what's broken.
 */
export const ENV_FIX_INSTRUCTIONS = {
  database:
    "Supabase Dashboard → Settings → Database → Connection Pooling. Copy the Transaction Pooler URL into DATABASE_URL and the Session Pooler URL into DIRECT_URL (.env.local and GitHub repo secrets).",
  supabase:
    "Supabase Dashboard → Settings → API. Copy the Project URL, anon public key, and service_role key into NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
  r2: "Cloudflare Dashboard → R2 → Manage API Tokens. Regenerate/copy the Account ID, Access Key ID, Secret Access Key, and bucket name into the matching CLOUDFLARE_R2_* variables.",
  googleDrive:
    "Refresh token likely expired or was revoked. Run: node scripts/getGoogleDriveRefreshToken.mjs — then update GOOGLE_OAUTH_REFRESH_TOKEN in .env.local and GitHub repo secrets.",
  emailjs:
    "EmailJS Dashboard → Account → API Keys. Confirm EMAILJS_SERVICE_ID, EMAILJS_GENERAL_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, and EMAILJS_PRIVATE_KEY (Strict Mode) match the dashboard.",
  githubActions:
    "GitHub → Settings → Developer settings → Personal access tokens. Regenerate GITHUB_ACTIONS_TOKEN (repo + workflow scopes) and confirm GITHUB_REPO_OWNER / GITHUB_REPO_NAME match this repository.",
  rateLimit:
    "Upstash Console → your Redis database → REST API. Copy UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
  geoip:
    "Download GeoLite2-City.mmdb from maxmind.com (free account) and place it at the path set in MAXMIND_DB_PATH (default: services/geoip/GeoLite2-City.mmdb).",
  vaultSecurity:
    "Check VAULT_SETUP_KEY, WIZARD_SETUP_KEY, VAULT_OWNER_EMAIL, and CRON_SECRET in .env.local and GitHub repo secrets. Regenerate a secret with: node scripts/generateEnvSecret.mjs VAULT_SETUP_KEY (or CRON_SECRET / WIZARD_SETUP_KEY)",
  aiInsightAndDirections:
    "Gemini: aistudio.google.com → Get API key → Create API key, into GEMINI_API_KEY. Google Maps/Weather: console.cloud.google.com → APIs & Services → Library, enable Geocoding API + Routes API + Weather API on one project, then Credentials → Create API Key (restrict it to those three APIs) — same key value works for both GOOGLE_MAPS_API_KEY and GOOGLE_WEATHER_API_KEY.",
  siteConfig:
    "Set NEXT_PUBLIC_SITE_URL to this site's live production URL in .env.local and GitHub repo secrets.",
};
