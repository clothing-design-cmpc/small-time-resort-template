/**
 * FILE: scripts/scaffoldEnvFile.mjs
 * ROLE: Terminal-only — manual entry point for scaffolding .env.local.
 *       Also auto-triggered silently by scripts/postinstallSetup.mjs
 *       on a fresh `npm install` — see that file for the safe/silent
 *       variant used there.
 *
 * PURPOSE:
 * .env* is gitignored (see .gitignore) and this repo ships no
 * .env.example, so a fresh `git clone` has ZERO starting point for
 * environment variables — every key name has to be hunted down by
 * hand from scattered service files. This script closes that gap: it
 * reads the exact same single source of truth already used by the env
 * checklist (scripts/lib/envGroups.mjs — the same list
 * services/envCheck.js and scripts/runEnvCheck.js already agree on),
 * and writes out a fully commented, grouped .env.local with every key
 * present as `KEY=` (blank value, ready to fill in).
 *
 * SAFETY — NEVER OVERWRITES:
 * If .env.local already exists, this script refuses to touch it and
 * exits with an explanation. A scaffold tool that could silently wipe
 * out already-filled-in secrets would be worse than no tool at all.
 * To regenerate from scratch, delete or rename the existing file
 * first — that's a deliberate, visible action, not something this
 * script should ever do on your behalf.
 *
 * USAGE: node scripts/scaffoldEnvFile.mjs  (or: npm run scaffold-env)
 */
import { existsSync } from "node:fs";
import { ENV_GROUPS } from "./lib/envGroups.mjs";
import { ENV_TARGET_PATH, writeEnvFile, openSetupGuide } from "./lib/envScaffold.mjs";

if (existsSync(ENV_TARGET_PATH)) {
  console.error(
    `\n${ENV_TARGET_PATH} already exists — refusing to overwrite it.\n` +
      "If you really want a fresh scaffold, rename or delete the existing file first, then re-run this script.\n"
  );
  process.exit(1);
}

const totalKeys = writeEnvFile();

console.log(
  `\n${ENV_TARGET_PATH} created with ${totalKeys} keys across ${ENV_GROUPS.length} groups.\n` +
    "Open it and fill in each value — see the setup wizard's env checklist step for where to get each one.\n" +
    "Opening the setup guide in your browser...\n"
);

await openSetupGuide(console.error);
