/**
 * FILE: scripts/scaffoldEnvFile.mjs
 * ROLE: Terminal-only — first thing a developer runs on a fresh clone,
 *       before the setup wizard's env checklist even means anything.
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
 * USAGE: node scripts/scaffoldEnvFile.mjs
 */
import { existsSync, writeFileSync } from "node:fs";
import { ENV_GROUPS } from "./lib/envGroups.mjs";

const TARGET_PATH = ".env.local";

if (existsSync(TARGET_PATH)) {
  console.error(
    `\n${TARGET_PATH} already exists — refusing to overwrite it.\n` +
      "If you really want a fresh scaffold, rename or delete the existing file first, then re-run this script.\n"
  );
  process.exit(1);
}

/**
 * buildEnvFileContent
 * Renders ENV_GROUPS into a commented, grouped .env.local body — one
 * section header per group (its label), one blank `KEY=` line per
 * variable, and a "(optional)" marker on keys where required: false.
 */
function buildEnvFileContent() {
  const header =
    "# Scaffolded by scripts/scaffoldEnvFile.mjs — fill in each value below.\n" +
    "# Every key here comes from scripts/lib/envGroups.mjs (the same list\n" +
    "# the setup wizard's env checklist and `npm run envcheck` both read).\n" +
    "# Lines marked (optional) are safe to leave blank for now.\n";

  const groupBlocks = ENV_GROUPS.map((group) => {
    const groupHeader = `\n# --- ${group.label} ---`;
    const keyLines = group.keys.map((entry) => {
      const suffix = entry.required ? "" : " # (optional)";
      return `${entry.key}=${suffix}`;
    });
    return [groupHeader, ...keyLines].join("\n");
  });

  return `${header}${groupBlocks.join("\n")}\n`;
}

writeFileSync(TARGET_PATH, buildEnvFileContent(), "utf-8");

const totalKeys = ENV_GROUPS.reduce((sum, group) => sum + group.keys.length, 0);
console.log(
  `\n${TARGET_PATH} created with ${totalKeys} keys across ${ENV_GROUPS.length} groups.\n` +
    "Open it and fill in each value — see the setup wizard's env checklist step for where to get each one.\n"
);
