/**
 * FILE: scripts/checkGatekeepers.js
 * PURPOSE:
 * Automated QA smoke test for the 3-Gatekeeper breach response
 * (services/breachResponse.js). Formalizes the manual test checklist
 * in docs/gatekeeper-testing.md into a repeatable script so this
 * feature can be re-verified after any future change without walking
 * through it by hand every time.
 *
 * *** NEVER RUN THIS AGAINST PRODUCTION. ***
 * This script deliberately trips real breach detectors — it exists to
 * prove the site correctly locks itself down and blocks attackers, and
 * doing that against a live production database means actually
 * locking down the live production site. Only ever point BASE_URL at
 * localhost or a disposable staging environment.
 *
 * WHAT THIS DOES AND DOES NOT COVER:
 * - Covers: Gatekeeper 1 (login brute force) and Gatekeeper 2 (SQL
 *   injection via the booking form) end-to-end, including confirming
 *   the middleware IP block actually takes effect afterward.
 * - Does NOT cover Gatekeeper 3 (anomalous admin login) — that needs a
 *   real prior login history and a genuinely different geolocation/
 *   device fingerprint to trigger honestly, which isn't something a
 *   repeatable script should fake without risking a false sense of
 *   security. See docs/gatekeeper-testing.md for how to test it by hand.
 * - Does NOT test the recovery page UI itself (system-vault/[vaultSlug]) or
 *   the EmailJS alert delivery — both require a browser session /
 *   real credentials respectively, out of scope for a headless script.
 *
 * SAFETY: every request in this script uses a fake, reserved
 * "documentation and testing" IP range (RFC 5737 TEST-NET-3,
 * 203.0.113.0/24) via the x-forwarded-for header, so this script can
 * never accidentally block the machine actually running it. The
 * cleanup step at the end always runs (in a `finally` block) and
 * removes every row this script created plus resets breachLockdown —
 * so a failed run never leaves the target site actually locked down.
 *
 * USAGE:
 *   BASE_URL=http://localhost:3000 node scripts/checkGatekeepers.js
 *   (or: npm run check:gatekeepers)
 * Reads DATABASE_URL from the environment for the Prisma checks —
 * .env.local covers this locally the same way every other script here does.
 */
import "./loadEnv.mjs";
// @prisma/client is a CommonJS module — Node's ESM loader (used when
// GitHub Actions runs this script directly with `node`, unlike Next.js's
// bundler which papers over this) can't statically resolve named exports
// from it, so `import { PrismaClient } from "@prisma/client"` throws
// "Named export 'PrismaClient' not found" at runtime. Default-import the
// whole module and destructure instead.
import prismaPkg from "@prisma/client";
const { PrismaClient } = prismaPkg;
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const RAW_BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
// Default is 127.0.0.1, not "localhost" — on some Windows setups
// (notably Git Bash / MINGW64), Node's fetch resolves "localhost" to
// the IPv6 loopback (::1) first, which the Next.js dev server usually
// isn't listening on, and undici reports that as a bare "fetch failed"
// with no useful detail. 127.0.0.1 sidesteps that resolution entirely.

/**
 * validateBaseUrl
 * Catches the single most common way BASE_URL ends up broken: copying
 * the "USAGE" example from this file's own header comment (or the
 * README) straight into .env.local, e.g.
 *   BASE_URL=http://localhost:3000 node scripts/checkGatekeepers.js
 * dotenv reads everything after the "=" as the value, so BASE_URL
 * becomes "http://localhost:3000 node scripts/checkGatekeepers.js" —
 * `new URL()` then throws a bare "Invalid URL" with no indication why.
 * This checks for that shape up front and prints exactly what's wrong.
 */
function validateBaseUrl(rawValue) {
  const trimmed = rawValue.trim();
  try {
    new URL(trimmed);
  } catch {
    console.error(`[checkGatekeepers] BASE_URL is not a valid URL: "${rawValue}"`);
    if (/\s/.test(trimmed)) {
      console.error(
        '[checkGatekeepers] It looks like extra text got appended after the URL (a common ' +
          "mistake: pasting this script's usage example — e.g. \"BASE_URL=http://localhost:3000 " +
          "node scripts/checkGatekeepers.js\" — directly into .env.local)."
      );
    }
    console.error(
      "[checkGatekeepers] Fix: open .env.local and set BASE_URL to just the URL, e.g. " +
        "BASE_URL=http://127.0.0.1:3000 — nothing else on that line."
    );
    process.exitCode = 1;
    return null;
  }
  return trimmed;
}

const BASE_URL = validateBaseUrl(RAW_BASE_URL);

// RFC 5737 TEST-NET-3 — reserved specifically for documentation and
// testing, guaranteed to never be a real visitor's or admin's IP.
// Overridable via env vars for a dry run against a specific IP (e.g.
// to rehearse the exact response for one that looked suspicious in
// Security Logs) — same override the browser-based Gatekeeper Tester
// page accepts (app/superAdmin/(protected)/gatekeeper-tester).
const TEST_IP_GATEKEEPER_1 = process.env.TEST_IP_GATEKEEPER_1 || "203.0.113.11";
const TEST_IP_GATEKEEPER_2 = process.env.TEST_IP_GATEKEEPER_2 || "203.0.113.22";

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed });
  console.log(`${passed ? "✓" : "✕"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * testGatekeeper1
 * Hammers the login endpoint with 6 wrong-password attempts from the
 * fake test IP (the limit is 5 per 15 minutes) and checks every step
 * of the resulting breach response actually happened.
 */
async function testGatekeeper1() {
  console.log("\n--- Gatekeeper 1: Login Brute Force ---");

  let lastStatus = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": TEST_IP_GATEKEEPER_1 },
      body: JSON.stringify({ email: "qa-gatekeeper-test@example.com", password: "wrongpassword123" }),
    });
    lastStatus = response.status;
  }
  record("6th login attempt returns 429 (rate limit tripped)", lastStatus === 429);

  // Give the fire-and-forget breach response a moment to finish writing.
  await sleep(1500);

  const blockedRow = await prisma.blockedIp.findUnique({ where: { ipAddress: TEST_IP_GATEKEEPER_1 } });
  record("BlockedIp row was created for the test IP", Boolean(blockedRow), blockedRow?.reason);

  const breachRow = await prisma.breachEvent.findFirst({
    where: { ipAddress: TEST_IP_GATEKEEPER_1, gatekeeper: 1 },
    orderBy: { createdAt: "desc" },
  });
  record("BreachEvent row was created (gatekeeper: 1)", Boolean(breachRow));

  const lockdownSettings = await prisma.systemSettings.findUnique({
    where: { id: "singleton" },
    select: { breachLockdown: true },
  });
  record("SystemSettings.breachLockdown flipped on", lockdownSettings?.breachLockdown === true);

  // The real proof: does proxy.js actually reject this IP now,
  // on a completely unrelated route?
  const blockedResponse = await fetch(`${BASE_URL}/`, {
    headers: { "x-forwarded-for": TEST_IP_GATEKEEPER_1 },
  });
  record("Blocked IP now gets 403 on an unrelated route", blockedResponse.status === 403);
}

/**
 * testGatekeeper2
 * Submits a booking with a classic SQL injection payload in the
 * guestName field (a free-text field with no format validation to
 * fight through, unlike guestEmail) and confirms it's rejected and
 * logged as its own breach.
 */
async function testGatekeeper2() {
  console.log("\n--- Gatekeeper 2: SQL Injection Attempt ---");

  const response = await fetch(`${BASE_URL}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": TEST_IP_GATEKEEPER_2 },
    body: JSON.stringify({
      bookingType: "day_tour",
      checkInDate: "2026-08-01",
      numberOfGuests: 2,
      guestName: "Robert' OR '1'='1",
      guestEmail: "qa-gatekeeper-test@example.com",
      guestPhone: "09171234567",
    }),
  });
  record("Booking with SQLi payload is rejected (400)", response.status === 400);

  await sleep(1500);

  const breachRow = await prisma.breachEvent.findFirst({
    where: { ipAddress: TEST_IP_GATEKEEPER_2, gatekeeper: 2 },
    orderBy: { createdAt: "desc" },
  });
  record("BreachEvent row was created (gatekeeper: 2)", Boolean(breachRow));

  const blockedRow = await prisma.blockedIp.findUnique({ where: { ipAddress: TEST_IP_GATEKEEPER_2 } });
  record("BlockedIp row was created for the test IP", Boolean(blockedRow));
}

/**
 * cleanup
 * Removes every row this script created and resets the site out of
 * lockdown. Runs unconditionally in main()'s finally block — a
 * failed/crashed run must never leave the target site actually locked
 * down for real visitors.
 */
async function cleanup() {
  console.log("\n--- Cleanup ---");
  await prisma.blockedIp.deleteMany({
    where: { ipAddress: { in: [TEST_IP_GATEKEEPER_1, TEST_IP_GATEKEEPER_2] } },
  });
  await prisma.breachEvent.deleteMany({
    where: { ipAddress: { in: [TEST_IP_GATEKEEPER_1, TEST_IP_GATEKEEPER_2] } },
  });
  await prisma.systemSettings
    .update({
      where: { id: "singleton" },
      data: { breachLockdown: false, maintenanceMode: false, breachActiveEventId: null },
    })
    .catch(() => {
      // No singleton row yet is fine — nothing to reset in that case.
    });
  console.log("Removed test BlockedIp/BreachEvent rows and reset breachLockdown to off.");
}

/**
 * checkServerIsReachable
 * Fails fast with a clear, actionable message instead of letting a
 * connection failure surface deep inside testGatekeeper1() as a bare
 * "fetch failed" — that error hides its real cause (wrong port, wrong
 * host, server not running) behind Node's generic wrapper by default.
 */
async function checkServerIsReachable() {
  try {
    await fetch(BASE_URL);
    return true;
  } catch (error) {
    console.error(`[checkGatekeepers] Could not reach ${BASE_URL}`);
    console.error(`[checkGatekeepers] Underlying error: ${error.cause?.message || error.message}`);
    console.error(
      "[checkGatekeepers] Check: is `npm run dev` actually running? Does the port in its \"Local:\" " +
        "URL match BASE_URL? If BASE_URL is unset, this script assumes http://127.0.0.1:3000."
    );
    return false;
  }
}

async function main() {
  if (!BASE_URL) {
    await prisma.$disconnect();
    return;
  }

  console.log(`[checkGatekeepers] Running against ${BASE_URL}`);
  console.log("[checkGatekeepers] NEVER point BASE_URL at production — this trips real breach detectors.\n");

  if (!(await checkServerIsReachable())) {
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  try {
    await testGatekeeper1();
    await testGatekeeper2();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }

  const failedChecks = results.filter((result) => !result.passed);
  console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed.`);

  if (failedChecks.length > 0) {
    console.log("\nFailed checks:");
    failedChecks.forEach((result) => console.log(`  ✕ ${result.name}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[checkGatekeepers] Unexpected error:", error.message);
  process.exitCode = 1;
});