/**
 * FILE: scripts/lib/withRetry.js
 * PURPOSE:
 * Retries an async database operation when it fails with a transient
 * network error — most notably EAI_AGAIN ("temporary failure in name
 * resolution"), which GitHub Actions' hosted runners occasionally hit
 * when resolving Supabase's pooler hostname. The error code itself
 * says "try again", so that's exactly what this does — a few times,
 * with a short delay between attempts — before giving up.
 *
 * Deliberately narrow: only the specific transient network error codes
 * below are retried. A real problem (bad password, missing table,
 * unique constraint violation, etc.) still fails immediately and loud,
 * so this never masks an actual bug behind a few seconds of retrying.
 */
const TRANSIENT_ERROR_CODES = new Set([
  "EAI_AGAIN", // DNS lookup temporarily failed
  "ENOTFOUND", // DNS lookup found nothing (can also be transient on CI)
  "ECONNRESET", // connection dropped mid-request
  "ETIMEDOUT", // connection attempt timed out
  "ECONNREFUSED", // target briefly not accepting connections (e.g. pooler restart)
]);

function getErrorCode(error) {
  return error?.code || error?.cause?.code || error?.meta?.code || null;
}

/**
 * withRetry
 * @param {() => Promise<any>} operation - the async call to attempt
 * @param {object} [options]
 * @param {number} [options.retries=3]   - total attempts before giving up
 * @param {number} [options.delayMs=2000] - wait between attempts (ms)
 * @param {string} [options.label="database operation"] - used in log lines only
 */
export async function withRetry(operation, options = {}) {
  const { retries = 3, delayMs = 2000, label = "database operation" } = options;
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const code = getErrorCode(error);
      const isTransient = TRANSIENT_ERROR_CODES.has(code);

      if (!isTransient || attempt === retries) {
        throw error;
      }

      console.warn(
        `[withRetry] ${label} failed (attempt ${attempt}/${retries}, ${code}) — retrying in ${delayMs}ms…`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Unreachable in practice (the loop above always returns or throws),
  // but keeps TypeScript/linters happy about a guaranteed return path.
  throw lastError;
}