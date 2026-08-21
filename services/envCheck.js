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
 * LIVE CHECKS:
 *   - Database:    SELECT 1 through the existing Prisma client
 *   - GeoIP:       confirms the .mmdb file at MAXMIND_DB_PATH exists on disk
 *   - EmailJS:     sends one real, clearly-labeled test email to
 *                  VAULT_OWNER_EMAIL. Unlike the other checks this DOES
 *                  have a side effect (uses one of EmailJS's limited
 *                  monthly sends) — acceptable ONLY because this whole
 *                  endpoint is already on-demand (owner clicks "Run
 *                  Environment Check" in EnvCheckerSection.jsx, never
 *                  runs on page load/mount), so it never fires without
 *                  the owner explicitly asking for it.
 *   - Telegram:    calls the Bot API's getMe endpoint to confirm
 *                  TELEGRAM_BOT_TOKEN is valid — no side effect (never
 *                  messages anyone), so unlike EmailJS this is safe to
 *                  run on every check, not just on-demand. Skipped (not
 *                  failed) when the token is unset entirely, since
 *                  Telegram alerts are an optional feature.
 * Every other group (Supabase, R2, GitHub Actions, Upstash, Vault/Security)
 * stays presence-only — a live network call to each on every run isn't
 * needed to answer "did someone forget to set this," and Supabase/R2
 * failures already surface immediately through normal app usage.
 *
 * GOOGLE DRIVE DROPPED (July 2026) — this used to run a live
 * drive.about.get() check too; removed along with the googleDrive env
 * group in scripts/lib/envGroups.mjs now that R2 is the only backup
 * destination (see services/vaultPassphraseBackup.js's header for the
 * full reasoning — Drive's OAuth refresh-token setup was too much
 * friction for the reliability it bought).
 */
import { prisma } from "@/services/prisma";
import { existsSync, statSync } from "node:fs";
import { sendGeneralEmail } from "@/services/emailjs";
import { verifyTelegramBotToken } from "@/services/telegram";
// ENV_GROUPS now lives in scripts/lib/envGroups.mjs so the nightly
// standalone check (scripts/runEnvCheck.js, runs via plain `node` and
// can't resolve the "@/" alias) and this on-demand dashboard check
// always agree on what "configured" means — see that file's header.
import { ENV_GROUPS } from "@/scripts/lib/envGroups.mjs";

/**
 * checkEnvGroupsPresence
 * Presence-only report for a subset of envGroups.mjs groups — same
 * { id, label, items, status } shape as checkEnvironment()'s groups,
 * but with no live checks (database ping, GeoIP file, EmailJS send)
 * and no live-check side effects. Synchronous, never awaited by
 * callers, since it never touches the network — used by the setup
 * wizard's database-status and remaining-env-status routes, which must
 * never trigger a real EmailJS send just from loading a wizard step.
 *
 * @param {string[]} groupIds - which envGroups.mjs group ids to include
 * @returns {{ groups: Array }}
 */
export function checkEnvGroupsPresence(groupIds) {
  const groups = ENV_GROUPS.filter((group) => groupIds.includes(group.id)).map((group) => {
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

  return { groups };
}

/**
 * checkEnvironment
 * Walks every group above, records presence for each key (never the
 * value), then runs the four live checks (database, GeoIP, Google
 * Drive, EmailJS). Never throws — a failing live check is reported as
 * a row in the result, not an exception, since a broken connection is
 * exactly the kind of thing this endpoint exists to surface.
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
  // The `reminder` field is ALWAYS populated (pass or fail) — this is
  // a standing reminder, not a failure-only message, since a present
  // but stale .mmdb file passes this check yet still needs refreshing
  // every ~2 weeks. EnvCheckerSection.jsx renders it unconditionally,
  // never gated behind the collapsed ApiSetupGuideSection accordion.
  let geoipLive = { status: "unknown", message: "Not checked." };
  const maxmindPath = process.env.MAXMIND_DB_PATH;
  const geoipReminder =
    "Reminder: GeoLite2-City.mmdb is a static file that only updates when you replace it manually. MaxMind refreshes GeoLite2 roughly every 2 weeks — sign up free at maxmind.com, download the latest GeoLite2 City .mmdb, and replace the file at this same path to keep location lookups accurate.";

  if (!maxmindPath) {
    geoipLive = { status: "failed", message: "MAXMIND_DB_PATH is not set.", reminder: geoipReminder };
  } else if (!existsSync(maxmindPath)) {
    geoipLive = { status: "failed", message: `No file found at ${maxmindPath}.`, reminder: geoipReminder };
  } else {
    // File age tells the owner at a glance how stale the committed
    // copy has become — this is on-disk mtime (last replaced), not
    // MaxMind's own release date.
    const fileAgeDays = Math.floor((Date.now() - statSync(maxmindPath).mtimeMs) / (1000 * 60 * 60 * 24));
    geoipLive = {
      status: "ok",
      message: `Database file found on disk (last replaced ${fileAgeDays} day(s) ago).`,
      reminder: geoipReminder,
    };
  }

  // --- Live check 3: EmailJS can actually send ---
  // Unlike the three checks above, this has a real side effect (sends
  // one email, using one of EmailJS's limited monthly sends) — safe
  // ONLY because checkEnvironment() is invoked exclusively on-demand
  // (EnvCheckerSection.jsx's "Run Environment Check" button), never on
  // page load, so it never fires without the owner explicitly asking.
  let emailjsLive = { status: "unknown", message: "Not checked." };
  const emailjsRequiredVars = ["EMAILJS_SERVICE_ID", "EMAILJS_GENERAL_TEMPLATE_ID", "EMAILJS_PUBLIC_KEY"];
  const missingEmailjsVars = emailjsRequiredVars.filter((key) => !process.env[key]);
  const vaultOwnerEmail = process.env.VAULT_OWNER_EMAIL;
  if (missingEmailjsVars.length > 0) {
    emailjsLive = { status: "failed", message: `Not configured — missing ${missingEmailjsVars.join(", ")}.` };
  } else if (!vaultOwnerEmail) {
    emailjsLive = { status: "failed", message: "VAULT_OWNER_EMAIL is not set — nowhere to send the test email." };
  } else {
    const checkedAtReadable = new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    });
    const sent = await sendGeneralEmail({
      toEmail: vaultOwnerEmail,
      subject: "Environment Check — Test Email",
      eyebrow: "ENVIRONMENT CHECK",
      heading: "EmailJS is working",
      intro: `This test email was sent by clicking "Run Environment Check" on the vault dashboard at ${checkedAtReadable} PHT.`,
      bodyMessage: "If you weren't expecting this, someone else with vault access just ran the check.",
      emailType: "env_check_test",
    });
    emailjsLive = sent
      ? { status: "ok", message: `Test email sent to ${vaultOwnerEmail}.` }
      : { status: "failed", message: "EmailJS rejected the send — check server logs for the exact response." };
  }

  // --- Live check 4: Telegram bot token is valid ---
  // Optional feature — an unset token is reported via the group's own
  // presence status (required: false, so it never shows "missing"),
  // not as a failed live check, so an owner who simply hasn't set up
  // Telegram alerts doesn't see a red "failed" badge for a feature
  // they never opted into.
  let telegramLive = { status: "unknown", message: "Not checked." };
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    telegramLive = { status: "ok", message: "Not configured — admin Telegram alerts are off (optional)." };
  } else {
    telegramLive = await verifyTelegramBotToken();
  }

  const groupsWithLiveChecks = groups.map((group) => {
    if (group.id === "database") return { ...group, liveCheck: databaseLive };
    if (group.id === "geoip") return { ...group, liveCheck: geoipLive };
    if (group.id === "emailjs") return { ...group, liveCheck: emailjsLive };
    if (group.id === "telegram") return { ...group, liveCheck: telegramLive };
    return group;
  });

  const overallStatus = groupsWithLiveChecks.some(
    (group) => group.status === "missing" || group.liveCheck?.status === "failed"
  )
    ? "attention_needed"
    : "ok";

  return { groups: groupsWithLiveChecks, overallStatus, checkedAt: new Date().toISOString() };
}
