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
 * USAGE: replace `import "dotenv/config";` with
 * `import "./loadEnv.mjs";` (adjust the relative path for the
 * importing file's location) at the top of any standalone script.
 */
import { config as loadEnvFile } from "dotenv";

// Load .env first, if it exists — acts as the base/default layer.
loadEnvFile();

// Layer .env.local on top, overriding any matching keys from .env —
// mirrors Next.js's own precedence so local dev values in .env.local
// are never silently ignored by standalone scripts.
loadEnvFile({ path: ".env.local", override: true });
