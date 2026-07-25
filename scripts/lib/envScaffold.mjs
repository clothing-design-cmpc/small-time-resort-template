/**
 * FILE: scripts/lib/envScaffold.mjs
 * PURPOSE:
 * Single source of truth for building .env.local's contents and
 * launching the setup guide — shared by two different entry points
 * with two different failure behaviors:
 *   1. scripts/scaffoldEnvFile.mjs — manual `npm run scaffold-env`,
 *      hard-fails (exit 1) if .env.local already exists.
 *   2. scripts/postinstallSetup.mjs — automatic `npm install` hook,
 *      must NEVER fail the install. Skips silently if .env.local
 *      already exists, and swallows any unexpected error.
 * Keeping the write + browser-launch logic in one place means both
 * entry points always scaffold the exact same file.
 */
import { writeFileSync } from "node:fs";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ENV_GROUPS } from "./envGroups.mjs";

export const ENV_TARGET_PATH = ".env.local";

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
const GUIDE_PATH = path.join(LIB_DIR, "..", "setup-guide.html");

/**
 * buildEnvFileContent
 * Renders ENV_GROUPS into a commented, grouped .env.local body — one
 * section header per group (its label), one blank `KEY=` line per
 * variable, and a "(optional)" marker on keys where required: false.
 */
export function buildEnvFileContent() {
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

/**
 * writeEnvFile
 * Writes the scaffolded content to .env.local and returns the total
 * key count, so callers can print a consistent summary line.
 */
export function writeEnvFile() {
  writeFileSync(ENV_TARGET_PATH, buildEnvFileContent(), "utf-8");
  return ENV_GROUPS.reduce((sum, group) => sum + group.keys.length, 0);
}

/**
 * openSetupGuide
 * Launches scripts/setup-guide.html in the developer's default browser.
 * Picks the right OS opener command (Windows/macOS/Linux) and never
 * throws — a failure here (e.g. headless CI) is a convenience miss,
 * never a reason to fail the calling script.
 *
 * @param {(message: string) => void} onError - called with a fallback
 *   message if the browser could not be launched (e.g. console.error).
 */
export function openSetupGuide(onError = () => {}) {
  const platform = process.platform;
  const openCommand =
    platform === "win32"
      ? `start "" "${GUIDE_PATH}"`
      : platform === "darwin"
        ? `open "${GUIDE_PATH}"`
        : `xdg-open "${GUIDE_PATH}"`;

  try {
    exec(openCommand, (error) => {
      if (error) {
        onError(`Could not auto-open the setup guide — open it manually: ${GUIDE_PATH}`);
      }
    });
  } catch {
    onError(`Could not auto-open the setup guide — open it manually: ${GUIDE_PATH}`);
  }
}
