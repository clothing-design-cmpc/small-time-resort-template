/**
 * FILE: services/rateLimit.js
 * PURPOSE:
 * Distributed rate limiter for public write/auth endpoints (login, vault
 * login/OTP, booking submissions). Backed by Upstash Redis so the attempt
 * count is shared across every server instance — a limit hit on one
 * instance is visible to all others immediately (Rule 32.1).
 *
 * Falls back to an in-memory, process-local counter ONLY when Upstash env
 * vars are not configured (e.g. local dev without a Redis project set up
 * yet). The fallback keeps this file runnable locally without Upstash —
 * it is not a production substitute, and it self-evicts empty keys so it
 * no longer grows unbounded the way the old version did.
 *
 * Required .env keys for the distributed path:
 *   UPSTASH_REDIS_REST_URL=
 *   UPSTASH_REDIS_REST_TOKEN=
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const hasUpstashConfig =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasUpstashConfig ? Redis.fromEnv() : null;

// Cache one Ratelimit instance per (max, windowMs) pair so repeated calls
// with the same limit config reuse the same limiter instead of
// reconstructing it on every request.
const limiterCache = new Map(); // "max:windowMs" -> Ratelimit instance

function getLimiter(max, windowMs) {
  const cacheKey = `${max}:${windowMs}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`),
      // Distinct prefix so this limiter's keys never collide with other
      // Upstash usage (e.g. Rule 38 anomaly detection) in the same Redis DB.
      prefix: "ratelimit",
    });
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

// --- In-memory fallback (local dev without Upstash configured only) ---
const fallbackRequestLog = new Map(); // key -> array of request timestamps (ms)
// Periodic sweep removes keys whose timestamp array has gone empty, so the
// fallback map doesn't grow unbounded across many distinct callers/IPs.
const FALLBACK_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
if (typeof globalThis.__rateLimitFallbackSweepStarted === "undefined") {
  globalThis.__rateLimitFallbackSweepStarted = true;
  setInterval(() => {
    for (const [key, timestamps] of fallbackRequestLog.entries()) {
      if (timestamps.length === 0) fallbackRequestLog.delete(key);
    }
  }, FALLBACK_SWEEP_INTERVAL_MS).unref?.();
}

function checkRateLimitFallback(key, max, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;

  const timestamps = (fallbackRequestLog.get(key) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= max) {
    fallbackRequestLog.set(key, timestamps);
    return { allowed: false };
  }

  timestamps.push(now);
  fallbackRequestLog.set(key, timestamps);
  return { allowed: true };
}

/**
 * checkRateLimit
 * Returns { allowed: boolean }. Allows up to `max` requests per `windowMs`
 * per key (typically the caller's IP plus an endpoint-specific prefix).
 * Async — every caller must `await` this.
 */
export async function checkRateLimit(key, max, windowMs) {
  if (!hasUpstashConfig) {
    return checkRateLimitFallback(key, max, windowMs);
  }

  const limiter = getLimiter(max, windowMs);
  const { success } = await limiter.limit(key);
  return { allowed: success };
}
