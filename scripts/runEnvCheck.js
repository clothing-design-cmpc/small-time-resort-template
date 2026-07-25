/**
 * FILE: scripts/runEnvCheck.js
 * PURPOSE:
 * Nightly environment health check — walks every ENV_GROUPS entry
 * (scripts/lib/envGroups.mjs) for presence, then runs the same live
 * reachability checks the on-demand dashboard version does (Database,
 * GeoIP file). If anything is missing or failing, emails
 * VAULT_OWNER_EMAIL with exactly what's broken AND how to fix it
 * (ENV_FIX_INSTRUCTIONS), plus a secondary webhook alert as a backup
 * channel. If everything checks out, it does nothing — no email, no
 * noise, so a working system never spams the owner's inbox.
 *
 * *** THIS SCRIPT IS DELIBERATELY NOT PART OF THE LIVE APP. ***
 * It never runs inside a Next.js API route or during a guest's
 * request — triggered on a schedule by .github/workflows/env-check.yml
 * (same 2 AM PHT window as the nightly database backup, on GitHub's
 * own cloud runners), so it has zero effect on booking response times.
 * Same reasoning as scripts/runBackup.js's own header (Rule 40.1).
 *
 * DIFFERENCES FROM services/envCheck.js (the dashboard version):
 *   - EmailJS group is presence-only here — the dashboard version
 *     sends a real test email as its live check, which is safe there
 *     only because a human explicitly clicked a button. Doing that
 *     every night would burn one of EmailJS's limited monthly sends
 *     for no reason; the alert email THIS script sends on failure
 *     already proves EmailJS works whenever there's something to
 *     report.
 *   - Database live check uses DIRECT_URL (session pooler) via its own
 *     PrismaClient instance, same as scripts/runBackup.js — this
 *     script talks to Postgres directly, never through the app's
 *     services/prisma.js singleton (which needs the "@/" alias that
 *     doesn't resolve under plain `node`).
 *
 * USAGE: npm run envcheck (reads all vars in scripts/lib/envGroups.mjs
 * from the environment — GitHub Actions injects these from repo
 * secrets; locally, .env.local covers it if you want to test manually)
 */
import "./loadEnv.mjs";
import { existsSync } from "node:fs";
import prismaPkg from "@prisma/client";
const { PrismaClient } = prismaPkg;
import { PrismaPg } from "@prisma/adapter-pg";
import { sendGeneralEmail } from "../services/emailjs.js";
import { sendVaultWebhookAlert } from "../services/webhookAlert.js";
import { ENV_GROUPS, ENV_FIX_INSTRUCTIONS } from "./lib/envGroups.mjs";
import { logDbHost } from "./lib/logDbHost.js";

logDbHost("DIRECT_URL", process.env.DIRECT_URL);
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

/**
 * checkPresence
 * Walks every group's keys, marking each present/missing without ever
 * reading or logging the actual value — same presence-only contract
 * as services/envCheck.js.
 */
function checkPresence() {
  return ENV_GROUPS.map((group) => {
    const items = group.keys.map(({ key, required }) => ({
      key,
      required,
      present: Boolean(process.env[key] && process.env[key].length > 0),
    }));
    const missingRequired = items.filter((item) => item.required && !item.present);
    return { id: group.id, label: group.label, items, missingRequired };
  });
}

/**
 * runLiveChecks
 * Database + GeoIP file reachability — the same side-effect-free live
 * checks services/envCheck.js runs, minus the EmailJS test-send (see
 * file header for why). Google Drive dropped along with the
 * googleDrive env group (see scripts/lib/envGroups.mjs).
 */
async function runLiveChecks() {
  const failures = [];

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    failures.push({ id: "database", message: `Connection failed: ${error.message}` });
  }

  const maxmindPath = process.env.MAXMIND_DB_PATH;
  if (!maxmindPath || !existsSync(maxmindPath)) {
    failures.push({ id: "geoip", message: `GeoIP database file not found at "${maxmindPath ?? "(unset)"}".` });
  }

  return failures;
}

/**
 * buildAlertEmailBody
 * One paragraph per failing group: what's wrong, then the matching fix
 * instruction from ENV_FIX_INSTRUCTIONS. Falls back to a generic line
 * if a group somehow has no matching instruction (should never happen,
 * but never let a missing dictionary entry crash the email).
 */
function buildAlertEmailBody(presenceGroups, liveFailures) {
  const lines = [];

  for (const group of presenceGroups) {
    if (group.missingRequired.length > 0) {
      const missingKeys = group.missingRequired.map((item) => item.key).join(", ");
      lines.push(
        `⚠ ${group.label}\nMissing: ${missingKeys}\nFix: ${ENV_FIX_INSTRUCTIONS[group.id] ?? "Check the corresponding .env.local value and GitHub repo secret."}`
      );
    }
  }

  for (const failure of liveFailures) {
    const group = ENV_GROUPS.find((entry) => entry.id === failure.id);
    lines.push(
      `⚠ ${group?.label ?? failure.id}\nProblem: ${failure.message}\nFix: ${ENV_FIX_INSTRUCTIONS[failure.id] ?? "Check the corresponding service credentials."}`
    );
  }

  return lines.join("\n\n");
}

async function main() {
  console.log("[envcheck] Starting nightly environment check…");

  const presenceGroups = checkPresence();
  const liveFailures = await runLiveChecks();

  const groupsWithMissing = presenceGroups.filter((group) => group.missingRequired.length > 0);
  const hasProblems = groupsWithMissing.length > 0 || liveFailures.length > 0;

  if (!hasProblems) {
    console.log("[envcheck] All groups OK — no email sent.");
    return;
  }

  const checkedAtReadable =
    new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    }) + " PHT";

  const bodyMessage = buildAlertEmailBody(groupsWithMissing, liveFailures);
  console.log(`[envcheck] Problems found:\n${bodyMessage}`);

  // Second, independent channel — sent regardless of whether the email
  // below succeeds, same dual-channel pattern as services/emailAlert.js.
  await sendVaultWebhookAlert(
    `⚠ Nightly environment check found problems at ${checkedAtReadable}.\nCheck the vault owner's email for full details and fix steps.`
  );

  const vaultOwnerEmail = process.env.VAULT_OWNER_EMAIL;
  if (!vaultOwnerEmail) {
    console.error("[envcheck] VAULT_OWNER_EMAIL is not set — skipping alert email (webhook alert still sent above).");
    process.exitCode = 1;
    return;
  }

  const sent = await sendGeneralEmail({
    toEmail: vaultOwnerEmail,
    subject: "Environment Check — action needed",
    eyebrow: "NIGHTLY ENVIRONMENT CHECK",
    heading: "Something needs attention",
    intro: `The nightly environment check ran at ${checkedAtReadable} and found the following:`,
    bodyMessage,
  });

  if (!sent) {
    console.error("[envcheck] Alert email failed to send (webhook alert still sent above).");
    process.exitCode = 1;
  } else {
    console.log(`[envcheck] Alert email sent to ${vaultOwnerEmail}.`);
  }
}

main()
  .catch((error) => {
    console.error("[envcheck] Unexpected error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
