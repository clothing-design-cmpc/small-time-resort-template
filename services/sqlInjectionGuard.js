/**
 * FILE: services/sqlInjectionGuard.js
 * PURPOSE:
 * Defense-in-depth SQL injection DETECTION layer for public write
 * endpoints. Prisma's parameterized queries already make classic SQL
 * injection structurally impossible in this app (Rule 18.2) — this
 * module does NOT add query safety on top of that. What it adds is
 * VISIBILITY: it flags and logs requests that contain known SQL
 * injection payload patterns, so an attempted attack shows up in
 * Security Logs even though it was never going to succeed. Treat a hit
 * here as a signal someone is probing the app, not proof of a breach.
 *
 * DATA FLOW:
 * 1. A route handler calls scanForSqlInjection(payload) right after
 *    parsing the request body, before it reaches Prisma
 * 2. If a pattern matches, the route logs a "sql_injection_attempt"
 *    SecurityLog row and returns a generic 400 — the attacker gets no
 *    indication of what tripped the check
 */

// Common SQL injection payload signatures — tautologies, statement
// stacking, comment terminators, UNION-based extraction, and known
// destructive/blind-injection functions. Intentionally broad; a false
// positive here just means "log it and ask the guest to retype," never
// a data-loss risk.
const SQLI_PATTERNS = [
  /(\bor\b|\band\b)\s+['"]?\s*\d+\s*['"]?\s*=\s*['"]?\s*\d+/i, // ' OR '1'='1
  /union(\s+all)?\s+select/i,
  /;\s*(drop|delete|truncate|alter|update|insert)\s+/i,
  /--\s*$/, // trailing SQL comment used to truncate a query
  /\/\*.*\*\//,
  /\bxp_cmdshell\b/i,
  /\b(sleep|benchmark|pg_sleep)\s*\(/i,
  /'\s*or\s*'.*'\s*=\s*'/i,
];

/** True if `value` (a string) matches any known SQL injection signature. */
export function containsSqlInjectionPattern(value) {
  if (typeof value !== "string") return false;
  return SQLI_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * scanForSqlInjection
 * Recursively checks every string value in a parsed JSON request body.
 * Returns the offending field path (e.g. "guestName") on the first hit,
 * or null if nothing matched.
 */
export function scanForSqlInjection(payload, pathPrefix = "") {
  if (payload === null || payload === undefined) return null;

  if (typeof payload === "string") {
    return containsSqlInjectionPattern(payload) ? pathPrefix || "(value)" : null;
  }

  if (typeof payload === "object") {
    for (const [key, value] of Object.entries(payload)) {
      const hit = scanForSqlInjection(value, pathPrefix ? `${pathPrefix}.${key}` : key);
      if (hit) return hit;
    }
  }

  return null;
}
