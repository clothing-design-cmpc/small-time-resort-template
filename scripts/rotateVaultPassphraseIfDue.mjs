/**
 * FILE: scripts/rotateVaultPassphraseIfDue.mjs
 * PURPOSE:
 * The monthly 30-day vault passphrase auto-rotation, run from GitHub
 * Actions instead of Vercel Cron (.github/workflows/vault-passphrase-
 * rotation.yml) — see that file's own header for why this project
 * needed a GitHub-based version: app/api/system-vault-setup/auto-
 * rotate/route.js only ever fires when the app is actually deployed
 * to Vercel (vercel.json's "crons" entry is a Vercel-platform feature,
 * not something Next.js runs on its own), and this project has been
 * running localhost-only, so that route has never once been called —
 * VaultPassphrase.expiresAt just sits in the past indefinitely, same
 * silent-forever failure mode overviewProject.txt's own DEBUG POINTS
 * section already warned about for the CRON_SECRET-unset case.
 *
 * UNLIKE scripts/rotateVaultPassphrase.mjs (the existing manual
 * "force a rotation right now" script), THIS script never forces
 * anything — it checks isVaultPassphraseExpired() first and is a
 * complete no-op (exit 0, nothing emailed/Telegrammed/logged) when
 * the 30 days aren't up yet. That check is what makes it safe to run
 * on a daily GitHub Actions schedule without rotating (and silently
 * invalidating the current passphrase + URL) every single day.
 *
 * Routes through services/vaultPassphrase.js's shared
 * generateAndDistributePassphrase() — the SAME rotate + email +
 * Telegram + R2 + audit-log flow the manual "Generate New Passphrase"
 * button, the Vercel cron route, and the OTHER terminal script all
 * use — so this never becomes a fourth place that quietly falls out
 * of sync with the other three (see auto-rotate/route.js's own
 * comment on exactly that problem).
 *
 * *** DELIBERATELY NOT PART OF THE LIVE APP. *** Talks to the DB
 * directly via DIRECT_URL, same "decoupled from live traffic"
 * reasoning as scripts/runBackup.js (Rule 40.1) — and the reason this
 * approach works at all even though the Next.js app itself only runs
 * on localhost: Supabase is a hosted, always-on database independent
 * of whether `npm run dev` happens to be running on anyone's laptop
 * that day. A GitHub Actions runner can reach it directly regardless.
 *
 * USAGE:
 *   npm run rotate-vault-passphrase-if-due
 *
 * Reads DIRECT_URL, VAULT_OWNER_EMAIL, EmailJS vars,
 * CLOUDFLARE_R2_* vars, and TELEGRAM_BOT_TOKEN the same way every
 * other standalone script does — from .env.local via
 * scripts/loadEnv.mjs (or real environment variables, e.g. GitHub
 * Actions secrets, if those are already set on process.env).
 */
import "./loadEnv.mjs";
import { logDbHost } from "./lib/logDbHost.js";
import { isVaultPassphraseExpired, VAULT_IDENTITY } from "../services/vaultAuth.js";
import { generateAndDistributePassphrase } from "../services/vaultPassphrase.js";
import { prisma } from "../services/prisma.js";

// This script (via services/prisma.js) only ever has DIRECT_URL set in CI —
// DATABASE_URL is intentionally left unset here (see prisma.js's own header
// comment on the fallback). Logging both up front turns a buried ECONNREFUSED
// several stack frames into services/vaultAuth.js into an immediate, plain
// answer to "which connection string is this actually using, and is it even
// a real Supabase host."
logDbHost("DATABASE_URL", process.env.DATABASE_URL);
logDbHost("DIRECT_URL", process.env.DIRECT_URL);

async function main() {
  console.log("[rotateVaultPassphraseIfDue] Checking whether the vault passphrase is due for rotation…");

  const isDue = await isVaultPassphraseExpired();

  if (!isDue) {
    console.log("[rotateVaultPassphraseIfDue] Not due yet — nothing to do.");
    return;
  }

  console.log("[rotateVaultPassphraseIfDue] Due for rotation — generating a new passphrase…");

  const { emailSent, telegramSent, r2Saved, r2SignedUrl } = await generateAndDistributePassphrase({
    actor: VAULT_IDENTITY,
    reason: "Automatic 30-day rotation (GitHub Actions)",
    generatedByLabel: "Automatic 30-day rotation (GitHub Actions)",
  });

  console.log("\n[rotateVaultPassphraseIfDue] Done.");
  console.log(`  Email sent to VAULT_OWNER_EMAIL: ${emailSent ? "yes" : "no — check logs above"}`);
  console.log(`  Sent to Telegram: ${telegramSent ? "yes" : "no — check logs above"}`);
  console.log(`  Saved to Cloudflare R2: ${r2Saved ? "yes" : "no — check logs above"}`);
  if (r2SignedUrl) console.log(`  R2 signed link (expires in 24h): ${r2SignedUrl}`);
  console.log(
    "\nThe new passphrase itself is NEVER printed to this terminal or logged anywhere — " +
      "check the VAULT_OWNER_EMAIL inbox, Telegram, or the R2 backup link above (before it expires) to read it."
  );
}

main()
  .catch((error) => {
    console.error("[rotateVaultPassphraseIfDue] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
