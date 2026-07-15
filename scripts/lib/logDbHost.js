/**
 * FILE: scripts/lib/logDbHost.js
 * PURPOSE:
 * Parses a Postgres connection string and prints (only) the hostname
 * it resolves to — password and username are never logged. Meant to
 * be called once at the top of every CLI script, right after loading
 * env vars, so a bad/incomplete connection string shows up immediately
 * as a clear log line instead of surfacing as a buried DNS error deep
 * in a Prisma stack trace several retries later.
 *
 * Also flags anything that doesn't look like a real Supabase pooler
 * or direct-connection hostname (missing a domain suffix is the most
 * common mistake — e.g. a connection string that got truncated while
 * being copied into GitHub Secrets).
 */

/**
 * logDbHost
 * @param {string} envVarName - name of the env var, for the log line only
 * @param {string|undefined} connectionString - the actual value
 */
export function logDbHost(envVarName, connectionString) {
  if (!connectionString) {
    console.warn(`[logDbHost] ${envVarName} is not set.`);
    return;
  }

  let hostname;
  try {
    // Postgres connection strings parse fine with the URL API —
    // "postgresql://user:pass@host:port/db" is a valid URL shape.
    hostname = new URL(connectionString).hostname;
  } catch {
    console.error(
      `[logDbHost] ${envVarName} is not a valid connection URL (couldn't be parsed at all — ` +
        "check for missing \"postgresql://\", stray whitespace, or line breaks in the secret value)."
    );
    return;
  }

  console.log(`[logDbHost] ${envVarName} resolves to host: "${hostname}"`);

  // A bare label with no dot (e.g. "aws-1-ap-northeast-1" instead of
  // "aws-1-ap-northeast-1.pooler.supabase.com") can never resolve —
  // this is the single most common way a Supabase connection string
  // ends up broken when copy-pasted.
  if (!hostname.includes(".")) {
    console.error(
      `[logDbHost] WARNING: "${hostname}" has no domain suffix — this looks truncated. ` +
        `A real Supabase host looks like "aws-1-ap-northeast-1.pooler.supabase.com" or ` +
        `"db.xxxxxxxxxxxx.supabase.co". Re-copy the full connection string from Supabase ` +
        `(Project Settings > Database > Connection string) into the ${envVarName} secret.`
    );
  }
}