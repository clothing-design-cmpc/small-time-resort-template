/**
 * FILE: services/envCheck.js
 * PURPOSE:
 * Checks whether every environment variable the app depends on is
 * actually set, without ever reading or returning the value itself —
 * this only ever reports presence/absence (and, for a few groups, a
 * cheap live reachability check), never the secret content. Powers the
 * vault dashboard's "Environment Check" card (Task 3) so the owner can
 * see at a glance what's missing after a fresh deploy or a rotated
 * secret, instead of discovering it the hard way (a failed upload, a
 * failed login email, a failed backup).
 *
 * WHY THIS LIVES OUTSIDE app/system-vault-setup:
 * system-vault-setup only ever reads ONE local env value
 * (VAULT_SETUP_KEY, via services/adminSession.js's
 * isValidVaultSetupKey()) and is not wired to the admin dashboard at
 * all — it exists purely as a break-glass bootstrap page. This checker
 * is the opposite: it reads every group of env vars the app actually
 * uses at runtime, and IS wired into the admin-facing vault dashboard
 * (app/system-vault/[vaultSlug]) precisely because that's the one
 * place already reserved for "is everything actually working"
 * questions.
 *
 * LIVE CHECKS (kept deliberately minimal):
 * Only two groups get an actual runtime check rather than a plain
 * presence check, because both are cheap, side-effect-free, and
 * directly answer "is it actually running" rather than just "is a
 * value present":
 *   - Database: SELECT 1 through the existing Prisma client
 *   - GeoIP:    confirms the .mmdb file at MAXMIND_DB_PATH exists on disk
 * Every other group (Supabase, R2, Google Drive, EmailJS, GitHub
 * Actions, Upstash, Vault/Security) is presence-only — a live network
 * call to each third party on every dashboard visit would be slow,
 * noisy in provider logs, and isn't needed to answer "did someone
 * forget to set this."
 */
import { prisma } from "@/services/prisma";
import { existsSync } from "node:fs";

/**
 * ENV_GROUPS
 * The full spec of what this app needs configured, grouped by the
 * service/feature it powers. `required: false` entries are optional
 * or CI/script-only knobs — flagged as informational, never as an error.
 */
const ENV_GROUPS = [
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
      { key: "GOOGLE_SERVICE_ACCOUNT_EMAIL", required: true },
      { key: "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", required: true },
      { key: "GOOGLE_DRIVE_FOLDER_ID", required: true },
      { key: "GOOGLE_DRIVE_BACKUP_FOLDER_ID", required: true },
      { key: "GOOGLE_OAUTH_CLIENT_ID", required: false },
      { key: "GOOGLE_OAUTH_CLIENT_SECRET", required: false },
      { key: "GOOGLE_OAUTH_REFRESH_TOKEN", required: false },
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
    id: "siteConfig",
    label: "Site configuration",
    keys: [
      { key: "NEXT_PUBLIC_SITE_URL", required: true },
      { key: "BASE_URL", required: false },
    ],
  },
];

/**
 * checkEnvironment
 * Walks every group above, records presence for each key (never the
 * value), then runs the two cheap live checks. Never throws — a
 * failing live check is reported as a row in the result, not an
 * exception, since a broken DB connection is exactly the kind of
 * thing this endpoint exists to surface.
 */
export async function checkEnvironment() {
  const groups = ENV_GROUPS.map((group) => {
    const items = group.keys.map(({ key, required }) => ({
      key,
      required,
      present: Boolean(process.env[key] && process.env[key].length > 0),
    }));
    const missingRequired = items.filter((item) => item.required && !item.present);
    return {
      id: group.id,
      label: group.label,
      items,
      status: missingRequired.length > 0 ? "missing" : "ok",
    };
  });

  // --- Live check 1: database reachability ---
  let databaseLive = { status: "unknown", message: "Not checked." };
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseLive = { status: "ok", message: "Connected successfully." };
  } catch (error) {
    databaseLive = { status: "failed", message: `Connection failed: ${error.message}` };
  }

  // --- Live check 2: GeoIP database file present on disk ---
  let geoipLive = { status: "unknown", message: "Not checked." };
  const maxmindPath = process.env.MAXMIND_DB_PATH;
  if (!maxmindPath) {
    geoipLive = { status: "failed", message: "MAXMIND_DB_PATH is not set." };
  } else {
    geoipLive = existsSync(maxmindPath)
      ? { status: "ok", message: "Database file found on disk." }
      : { status: "failed", message: `No file found at ${maxmindPath}.` };
  }

  const groupsWithLiveChecks = groups.map((group) => {
    if (group.id === "database") return { ...group, liveCheck: databaseLive };
    if (group.id === "geoip") return { ...group, liveCheck: geoipLive };
    return group;
  });

  const overallStatus = groupsWithLiveChecks.some(
    (group) => group.status === "missing" || group.liveCheck?.status === "failed"
  )
    ? "attention_needed"
    : "ok";

  return { groups: groupsWithLiveChecks, overallStatus, checkedAt: new Date().toISOString() };
}
