/**
 * FILE: scripts/postinstallSetup.mjs
 * ROLE: Wired to package.json's "postinstall" AND "predev" scripts —
 *       runs automatically at the end of every `npm install` AND
 *       right before every `npm run dev`.
 *
 * WHY TWO TRIGGERS (AND NOT A VS CODE TASK):
 * A VS Code "runOn": "folderOpen" task was tried first so the guide
 * would also reopen on `code .`, not just `npm install`. In practice
 * that trigger proved unreliable (workspace-trust/automatic-tasks
 * approval state, shell environment differences) — `predev` is a
 * plain npm lifecycle hook with no extra approval step, and `npm run
 * dev` is something every dev runs every session anyway, so it's a
 * more reliable "keep checking until it's actually done" trigger than
 * an editor-level hook.
 *
 * PURPOSE:
 * Mirrors the "clone a repo and a page opens automatically" onboarding
 * pattern: right after `npm install` (or right before `npm run dev`),
 * silently scaffold .env.local (same logic as `npm run scaffold-env`,
 * only if it doesn't exist yet) and open scripts/setup-guide.html in
 * the browser — no extra command needed.
 *
 * GATED ON WIZARD COMPLETION, NOT ON .env.local EXISTING:
 * .env.local existing is NOT the same thing as setup being finished —
 * a dev commonly creates .env.local on day one, then runs `npm install`
 * or `npm run dev` again many times over the following days (fresh
 * clone elsewhere, node_modules wiped, CI, a teammate pulling the repo)
 * while the wizard still isn't finished yet. Gating solely on
 * .env.local existing meant the guide would only ever open ONCE, even
 * though the actual first-run setup was still incomplete.
 * isWizardLockedStandalone() (scripts/lib/wizardLockCheck.mjs) is the
 * same derived truth app/system-setup-wizard itself locks on
 * (services/setupWizardStatus.js) — so this script now keeps
 * reopening the guide on every trigger until the wizard has actually
 * been completed, then goes permanently silent, matching the
 * wizard's own AUTO-LOCK behavior instead of a separate, looser rule.
 *
 * CRITICAL — MUST NEVER FAIL THE INSTALL:
 * `npm install` also runs in CI, on deploy platforms, and on every
 * teammate's machine re-installing an already-configured project.
 * This script must be a no-op (exit 0, no noise) whenever:
 *   - the wizard has already been completed (isWizardLockedStandalone()
 *     returns true — the common steady-state case for anyone past day one)
 *   - the environment is headless/CI (browser launch will just fail
 *     silently — caught and ignored, never thrown)
 *   - anything else goes wrong (best-effort convenience only)
 * A non-zero exit code here would make `npm install` itself report
 * failure, which would be far worse than a missed browser popup.
 *
 * ASYNC/AWAIT IS REQUIRED HERE:
 * openSetupGuide() launches the browser via the async exec() —
 * calling process.exit() right after firing it (without awaiting)
 * kills the child process before it ever launches the browser. This
 * script MUST await openSetupGuide() before its final process.exit(0).
 *
 * USAGE: never run directly — invoked by `npm install` and `npm run
 * dev` via package.json's postinstall/predev scripts.
 */
import { existsSync } from "node:fs";
import { ENV_TARGET_PATH, writeEnvFile, openSetupGuide } from "./lib/envScaffold.mjs";
import { isWizardLockedStandalone } from "./lib/wizardLockCheck.mjs";

async function main() {
  // Setup already finished (owner admin + vault passphrase both exist)
  // — the wizard itself would 404 too. Go permanently silent, same as
  // the wizard's own AUTO-LOCK behavior.
  const alreadyLocked = await isWizardLockedStandalone();
  if (alreadyLocked) {
    return;
  }

  // Wizard isn't finished yet — scaffold .env.local only if it isn't
  // already there (never overwrite a dev's in-progress values), then
  // open (or reopen) the guide either way.
  let statusLine;
  if (!existsSync(ENV_TARGET_PATH)) {
    const totalKeys = writeEnvFile();
    statusLine = `${ENV_TARGET_PATH} created with ${totalKeys} keys — opening the setup guide...`;
  } else {
    statusLine = `Setup isn't finished yet — reopening the setup guide (${ENV_TARGET_PATH} already exists)...`;
  }

  console.log(
    `\n${statusLine}\n` +
      "(This reopens automatically before `npm run dev` and after `npm install` until the wizard is completed — " +
      "fill in the values, then follow the guide.)\n"
  );

  // Await the launch attempt — swallow failures (e.g. headless CI), never affect the install's exit code.
  await openSetupGuide(() => {});
}

main()
  .catch((error) => {
    // Any unexpected error here is a missed convenience, not an install failure.
    console.error("[postinstallSetup] Skipped env scaffold/guide:", error.message);
  })
  .finally(() => {
    process.exit(0);
  });
