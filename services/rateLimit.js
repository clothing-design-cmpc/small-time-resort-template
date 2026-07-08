/**
 * FILE: services/rateLimit.js
 * PURPOSE:
 * Lightweight in-memory rate limiter for public write endpoints (booking
 * submissions, contact forms). Process-local — resets on server
 * restart and does not share state across multiple server instances.
 * That's an acceptable tradeoff for this template's single-instance
 * deployment; swap for @upstash/ratelimit (Rule 32.1) if this ever
 * runs on more than one instance.
 */
const requestLog = new Map(); // ip -> array of request timestamps (ms)

/**
 * checkRateLimit
 * Returns { allowed: boolean }. Allows up to `max` requests per `windowMs`
 * per key (typically the caller's IP).
 */
export function checkRateLimit(key, max, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;

  const timestamps = (requestLog.get(key) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= max) {
    requestLog.set(key, timestamps);
    return { allowed: false };
  }

  timestamps.push(now);
  requestLog.set(key, timestamps);
  return { allowed: true };
}
