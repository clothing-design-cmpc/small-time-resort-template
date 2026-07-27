/**
 * FILE: scripts/loadEnv.mjs
 * PURPOSE:
 * Shared env-loading helper for standalone Node scripts and
 * prisma.config.mjs — anything that runs OUTSIDE the Next.js dev/build
 * process. Next.js has its own built-in env file precedence
 * (.env loaded first, then .env.local layered on top and overriding
 * matching keys), but a bare `import "dotenv/config"` does NOT
 * replicate that — it only ever reads .env, silently ignoring
 * .env.local entirely. Since this project's own setup guide
 * (api-setup-guide.txt) tells people to put their real values in
 * .env.local, any standalone script using bare "dotenv/config" would
 * silently run with missing/empty values for anyone who only has
 * .env.local and no .env file.
 *
 * This file replicates Next's precedence for non-Next contexts: load
 * .env first (defaults, if present), then .env.local on top with
 * override: true so matching keys take precedence — same effective
 * behavior Next.js gives the app automatically at runtime.
 *
 * REAL ENVIRONMENT VARIABLES ALWAYS WIN (e.g. CI/CD secrets):
 * override: true on .env.local does not distinguish "a real variable
 * already injected into process.env by the platform" (GitHub Actions
 * `env:` blocks, Vercel, Docker, etc.) from "a key that merely exists
 * in a file". On a fresh CI checkout, postinstallSetup.mjs (Rule 43)
 * scaffolds a blank .env.local with every key present but empty. If
 * that gets loaded with override:true AFTER the CI platform already
 * set the real DIRECT_URL/DATABASE_URL secret on process.env, the
 * blank file value silently wins and env("DIRECT_URL") throws — this
 * was the exact cause of "Cannot resolve environment variable:
 * DIRECT_URL" across every scheduled workflow. Next.js itself always
 * treats real process env as the highest-precedence layer, above both
 * .env.local and .env — this file must match that, not just the
 * file-vs-file precedence between .env and .env.local.
 *
 * USAGE: replace `import "dotenv/config";` with
 * `import "./loadEnv.mjs";` (adjust the relative path for the
 * importing file's location) at the top of any standalone script.
 */
import { config as loadEnvFile } from "dotenv";

// Snapshot whatever was already in process.env BEFORE loading any
// files — this captures real CI/CD-injected secrets so they can be
// restored after file loading, regardless of load order below.
const realEnvSnapshot = { ...process.env };

// Load .env first, if it exists — acts as the base/default layer.
loadEnvFile();

// Layer .env.local on top, overriding any matching keys from .env —
// mirrors Next.js's own precedence so local dev values in .env.local
// are never silently ignored by standalone scripts.
loadEnvFile({ path: ".env.local", override: true });

// Restore any variable that was already present (and non-empty) in
// the real process environment before file loading. This guarantees
// a genuine CI/CD secret can never be blanked out by a scaffolded
// placeholder key sitting in .env.local with an empty value.
for (const [key, value] of Object.entries(realEnvSnapshot)) {
  if (value !== "") {
    process.env[key] = value;
  }
}
