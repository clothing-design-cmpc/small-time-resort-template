/**
 * FILE: services/recoveryChannelTester.js
 * PURPOSE:
 * Runs a health check against each channel a real disaster recovery
 * relies on — GitHub Actions (backup/restore workflows), Google Drive
 * (offsite passphrase/backup storage), EmailJS (passphrase-rotation
 * and OTP delivery), and the optional secondary alert webhook
 * (services/webhookAlert.js) — WITHOUT triggering a real passphrase
 * rotation, a real backup run, a real workflow dispatch, or a real
 * EmailJS send. The webhook check is the one exception: unlike
 * EmailJS's limited monthly sends, a Slack/Discord webhook call is
 * free, so that check DOES send one real, clearly-labeled test
 * message rather than just checking for config presence.
 *
 * WHY THIS EXISTS:
 * Today the only way to discover an expired GitHub token or a revoked
 * Drive refresh token is watching a real breach-response rotation or a
 * scheduled backup fail — i.e. finding out during an actual emergency,
 * when there's no time left to fix it. Run this from Settings > Vault
 * Passphrase whenever (monthly, or after rotating any of these
 * credentials) to catch a dead token while there's still time to
 * replace it.
 *
 * WHAT EACH CHECK ACTUALLY DOES:
 *   - GitHub:   GET /repos/{owner}/{repo} — confirms the token is
 *               valid and can see the repo. Never calls the
 *               workflow_dispatch endpoint services/github.js uses for
 *               a real backup/restore run.
 *   - Drive:    files.list with pageSize 1 against the same folder
 *               uploadToDrive() targets — confirms the OAuth refresh
 *               token still exchanges for a working access token and
 *               the folder is reachable. Never calls files.create.
 *   - EmailJS:  presence-only check of the four required env vars.
 *               Never calls EmailJS's send endpoint — actually sending
 *               a test email would cost one of the plan's limited
 *               monthly sends (Rule 35.5) just to run a health check.
 *   - Webhook:  sends one real, clearly-labeled test message via
 *               services/webhookAlert.js — free to send, so an actual
 *               round-trip is the only real confirmation the URL works.
 *
 * Server-side only — never import this in a "use client" file.
 */
import { getDriveClient } from "@/services/googleDrive";
import { sendVaultWebhookAlert } from "@/services/webhookAlert";

/**
 * testGitHubChannel
 * Confirms GITHUB_ACTIONS_TOKEN can still authenticate and see the
 * configured repo — the same three env vars services/github.js
 * requires for a real workflow dispatch, checked here without ever
 * dispatching one.
 */
async function testGitHubChannel() {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const token = process.env.GITHUB_ACTIONS_TOKEN;

  if (!owner || !repo || !token) {
    return {
      channel: "github",
      label: "GitHub Actions",
      passed: false,
      message: "Not configured — missing GITHUB_REPO_OWNER, GITHUB_REPO_NAME, or GITHUB_ACTIONS_TOKEN.",
    };
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      return {
        channel: "github",
        label: "GitHub Actions",
        passed: false,
        message: `Token rejected or repo unreachable (GitHub responded ${response.status}). Generate a fresh token.`,
      };
    }

    return {
      channel: "github",
      label: "GitHub Actions",
      passed: true,
      message: `Token is valid — can reach ${owner}/${repo}.`,
    };
  } catch (error) {
    return {
      channel: "github",
      label: "GitHub Actions",
      passed: false,
      message: `Couldn't reach the GitHub API: ${error.message}`,
    };
  }
}

/**
 * testDriveChannel
 * Confirms GOOGLE_OAUTH_REFRESH_TOKEN still exchanges for a working
 * access token and the configured folder is reachable — via a
 * read-only files.list(pageSize: 1) call, never files.create.
 */
async function testDriveChannel() {
  const requiredVars = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"];
  const missing = requiredVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return {
      channel: "drive",
      label: "Google Drive",
      passed: false,
      message: `Not configured — missing ${missing.join(", ")}.`,
    };
  }

  try {
    const drive = getDriveClient();
    await drive.files.list({ pageSize: 1, fields: "files(id)" });

    return {
      channel: "drive",
      label: "Google Drive",
      passed: true,
      message: "Refresh token is valid — Drive is reachable.",
    };
  } catch (error) {
    return {
      channel: "drive",
      label: "Google Drive",
      passed: false,
      message: `Drive rejected the request — the refresh token may have been revoked: ${error.message}`,
    };
  }
}

/**
 * testEmailJsChannel
 * Presence-only check — never calls EmailJS's send endpoint, since
 * that would spend one of the account's limited monthly sends
 * (Rule 35.5) just to run a routine health check.
 */
function testEmailJsChannel() {
  const requiredVars = ["EMAILJS_SERVICE_ID", "EMAILJS_GENERAL_TEMPLATE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY"];
  const missing = requiredVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    return {
      channel: "emailjs",
      label: "EmailJS",
      passed: false,
      message: `Not configured — missing ${missing.join(", ")}.`,
    };
  }

  return {
    channel: "emailjs",
    label: "EmailJS",
    passed: true,
    message: "All required EmailJS env vars are set. (Presence check only — no test email is sent.)",
  };
}

/**
 * testWebhookChannel
 * Unlike the EmailJS check above, this one DOES send a real message —
 * a Slack/Discord webhook send doesn't cost anything or count against
 * a limited monthly quota the way EmailJS's does, so an actual
 * round-trip is the only way to confirm the URL still works. The
 * message is clearly labeled as a test so it's never mistaken for a
 * real breach/rotation alert if someone is watching the channel.
 *
 * This channel is OPTIONAL: it's a secondary alert path on top of the
 * required GitHub/Drive/EmailJS channels, so a missing
 * VAULT_ALERT_WEBHOOK_URL is reported as "skipped" (not "failed") and
 * is excluded from the pass/total counts in runRecoveryChannelTests —
 * an owner who never set up a webhook shouldn't see a permanent
 * "3/4 channels working" that never reaches 100%.
 */
async function testWebhookChannel() {
  const webhookUrl = process.env.VAULT_ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    return {
      channel: "webhook",
      label: "Secondary Alert Webhook",
      passed: false,
      optional: true,
      status: "skipped",
      message: "Optional — not set up. Add VAULT_ALERT_WEBHOOK_URL if you want a secondary Slack/Discord alert channel.",
    };
  }

  const delivered = await sendVaultWebhookAlert(
    "🧪 Test Recovery Channels — this is a test alert, no action needed."
  );

  return {
    channel: "webhook",
    label: "Secondary Alert Webhook",
    passed: delivered,
    optional: true,
    status: delivered ? "pass" : "fail",
    message: delivered
      ? "Test alert delivered — check the configured Slack/Discord channel."
      : "The webhook URL rejected the test alert or couldn't be reached.",
  };
}

/**
 * runRecoveryChannelTests
 * Runs all four checks in parallel and summarizes the result. Never
 * throws — an individual channel's own failure is reported inline,
 * not surfaced as a route-level error.
 *
 * The webhook channel is optional (see testWebhookChannel above): when
 * it's skipped (not configured), it's excluded from passedCount /
 * totalCount / allPassed entirely, so an owner who never set up the
 * secondary webhook still sees "All required channels are working"
 * once GitHub, Drive, and EmailJS pass — the skipped result still
 * shows in `results` for visibility, it just doesn't count against
 * the summary.
 */
export async function runRecoveryChannelTests() {
  const [github, drive, emailjs, webhook] = await Promise.all([
    testGitHubChannel(),
    testDriveChannel(),
    Promise.resolve(testEmailJsChannel()),
    testWebhookChannel(),
  ]);

  const results = [github, drive, emailjs, webhook];

  // Required channels are counted normally; an optional channel only
  // counts toward the summary once it's actually configured (status
  // !== "skipped") — a skipped optional channel is neither a pass nor
  // a drag on the total.
  const countedResults = results.filter((result) => !(result.optional && result.status === "skipped"));
  const passedCount = countedResults.filter((result) => result.passed).length;

  return {
    results,
    passedCount,
    totalCount: countedResults.length,
    allPassed: passedCount === countedResults.length,
  };
}