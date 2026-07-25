/**
 * FILE: scripts/postinstallSetup.mjs
 * ROLE: Wired to package.json's "postinstall" script — runs
 *       automatically at the end of every `npm install`.
 *
 * PURPOSE:
 * Mirrors the "clone a repo and a page opens automatically" onboarding
 * pattern: right after a fresh `npm install`, silently scaffold
 * .env.local (same logic as `npm run scaffold-env`) and open
 * scripts/setup-guide.html in the browser — no extra command needed.
 *
 * CRITICAL — MUST NEVER FAIL THE INSTALL:
 * `npm install` also runs in CI, on deploy platforms, and on every
 * teammate's machine re-installing an already-configured project.
 * This script must be a no-op (exit 0, no noise) whenever:
 *   - .env.local already exists (most common case — a dev re-running
 *     `npm install` on a project they already set up)
 *   - the environment is headless/CI (browser launch will just fail
 *     silently — caught and ignored, never thrown)
 *   - anything else goes wrong (best-effort convenience only)
 * A non-zero exit code here would make `npm install` itself report
 * failure, which would be far worse than a missed browser popup.
 *
 * USAGE: never run directly — invoked by `npm install` via package.json.
 */
import { existsSync } from "node:fs";
import { ENV_TARGET_PATH, writeEnvFile, openSetupGuide } from "./lib/envScaffold.mjs";

try {
  // Already configured (or already scaffolded) — nothing to do, stay silent.
  if (existsSync(ENV_TARGET_PATH)) {
    process.exit(0);
  }

  const totalKeys = writeEnvFile();
  console.log(
    `\n${ENV_TARGET_PATH} created with ${totalKeys} keys — opening the setup guide...\n` +
      "(This runs once, automatically, after a fresh install. Fill in the values, then follow the guide.)\n"
  );

  // Swallow browser-launch failures (e.g. headless CI) — never affect the install's exit code.
  openSetupGuide(() => {});
} catch (error) {
  // Any unexpected error here is a missed convenience, not an install failure.
  console.error("[postinstallSetup] Skipped env scaffold/guide:", error.message);
}

process.exit(0);
