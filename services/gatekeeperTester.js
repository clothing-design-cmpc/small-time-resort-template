/**
 * FILE: services/gatekeeperTester.js
 * PURPOSE:
 * Core logic for the two automatable Gatekeeper checks (login brute
 * force + booking SQL injection), used by the hidden "Gatekeeper
 * Tester" page (app/gatekeeper-vault/[gatekeeperSlug]) via its API
 * route. This is the browser-triggerable counterpart to
 * scripts/checkGatekeepers.js — that CLI script stays independent on
 * purpose (it runs standalone via `node`, outside the Next.js process,
 * with its own already-tested Prisma setup), so the two don't share
 * code, but they exercise the exact same behavior end-to-end.
 *
 * *** NEVER RUN THIS AGAINST A DEPLOYMENT REAL VISITORS ARE USING. ***
 * Same warning as the CLI script: this deliberately trips real breach
 * detectors, so running it means the site actually locks itself down
 * (briefly — cleanup always restores prior state, see below).
 *
 * SAFETY:
 * - Defaults to RFC 5737 TEST-NET-3 (203.0.113.0/24), reserved for
 *   documentation/testing and guaranteed to never be a real visitor's
 *   or admin's IP.
 * - A custom IP is accepted (an admin may want to rehearse the exact
 *   response for a specific IP), but anything outside the reserved
 *   test/documentation ranges comes back as a warning for the caller
 *   to surface — never blocked outright, since a legitimate reason to
 *   test a specific IP does exist.
 * - Before making any request, this snapshots SystemSettings so
 *   cleanup restores the admin's actual prior values (including
 *   maintenanceMode, in case it was already on for an unrelated
 *   reason) instead of blindly forcing everything back to "off".
 * - Cleanup runs unconditionally in a finally block — a failed or
 *   crashed dry run must never leave the site actually locked down.
 */
import { prisma } from "@/services/prisma";

const DEFAULT_TEST_IP_1 = "203.0.113.11"; // Gatekeeper 1 — login brute force
const DEFAULT_TEST_IP_2 = "203.0.113.22"; // Gatekeeper 2 — SQLi via booking form

// RFC 5737 TEST-NET-1/2/3 + RFC 3927 link-local — reserved ranges that
// are safe to use as fake test IPs. Anything outside these is flagged
// back to the caller as a warning, not blocked.
const RESERVED_TEST_RANGES = [/^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./, /^169\.254\./];

function isReservedTestIp(ip) {
  return RESERVED_TEST_RANGES.some((pattern) => pattern.test(ip));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * runGatekeeperDryRun
 * Runs Gatekeeper 1 (login brute force) and Gatekeeper 2 (booking
 * SQLi) end-to-end against baseUrl, using the given test IPs, then
 * always restores the site to its pre-run state. Returns a flat list
 * of named checks instead of printing to console — the API route
 * decides how to log/display it.
 *
 * @param {object} input
 * @param {string} input.baseUrl   - Origin to test against (the deployment's own origin)
 * @param {string} [input.testIp1] - IP for Gatekeeper 1, defaults to a reserved test-net address
 * @param {string} [input.testIp2] - IP for Gatekeeper 2, defaults to a reserved test-net address
 */
export async function runGatekeeperDryRun({ baseUrl, testIp1, testIp2 }) {
  const ip1 = (testIp1 || DEFAULT_TEST_IP_1).trim();
  const ip2 = (testIp2 || DEFAULT_TEST_IP_2).trim();

  const warnings = [];
  if (!isReservedTestIp(ip1)) {
    warnings.push(`Test IP 1 (${ip1}) isn't in a reserved test range — make sure it isn't a real visitor's IP.`);
  }
  if (!isReservedTestIp(ip2)) {
    warnings.push(`Test IP 2 (${ip2}) isn't in a reserved test range — make sure it isn't a real visitor's IP.`);
  }
  if (ip1 === ip2) {
    warnings.push("Test IP 1 and Test IP 2 are the same — Gatekeeper 1 and 2 results may interfere with each other.");
  }

  const checks = [];
  const check = (name, passed, detail = "") => checks.push({ name, passed, detail });

  // Snapshot current settings before touching anything, so cleanup can
  // restore the admin's actual prior state instead of guessing at it.
  const priorSettings = await prisma.systemSettings.findUnique({
    where: { id: "singleton" },
    select: { breachLockdown: true, maintenanceMode: true, maintenanceMessage: true, breachActiveEventId: true },
  });

  try {
    // --- Gatekeeper 1: login brute force ---
    let lastStatus = null;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ip1 },
        body: JSON.stringify({ email: "qa-gatekeeper-test@example.com", password: "wrongpassword123" }),
      });
      lastStatus = response.status;
    }
    check("Gatekeeper 1 — 6th login attempt returns 429 (rate limit tripped)", lastStatus === 429);

    // Give the fire-and-forget breach response a moment to finish writing.
    await sleep(1500);

    const blockedRow1 = await prisma.blockedIp.findUnique({ where: { ipAddress: ip1 } });
    check("Gatekeeper 1 — BlockedIp row created for the test IP", Boolean(blockedRow1), blockedRow1?.reason ?? "");

    const breachRow1 = await prisma.breachEvent.findFirst({
      where: { ipAddress: ip1, gatekeeper: 1 },
      orderBy: { createdAt: "desc" },
    });
    check("Gatekeeper 1 — BreachEvent row created (gatekeeper: 1)", Boolean(breachRow1));

    const lockdownSettings = await prisma.systemSettings.findUnique({
      where: { id: "singleton" },
      select: { breachLockdown: true },
    });
    check("Gatekeeper 1 — SystemSettings.breachLockdown flipped on", lockdownSettings?.breachLockdown === true);

    // The real proof: does proxy.js actually reject this IP now, on a
    // completely unrelated route?
    const blockedResponse = await fetch(`${baseUrl}/`, { headers: { "x-forwarded-for": ip1 } });
    check("Gatekeeper 1 — blocked IP now gets 403 on an unrelated route", blockedResponse.status === 403);

    // --- Gatekeeper 2: SQL injection via the booking form ---
    const sqliResponse = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip2 },
      body: JSON.stringify({
        bookingType: "day_tour",
        checkInDate: "2026-08-01",
        numberOfGuests: 2,
        guestName: "Robert' OR '1'='1",
        guestEmail: "qa-gatekeeper-test@example.com",
        guestPhone: "09171234567",
      }),
    });
    check("Gatekeeper 2 — booking with SQLi payload is rejected (400)", sqliResponse.status === 400);

    await sleep(1500);

    const breachRow2 = await prisma.breachEvent.findFirst({
      where: { ipAddress: ip2, gatekeeper: 2 },
      orderBy: { createdAt: "desc" },
    });
    check("Gatekeeper 2 — BreachEvent row created (gatekeeper: 2)", Boolean(breachRow2));

    const blockedRow2 = await prisma.blockedIp.findUnique({ where: { ipAddress: ip2 } });
    check("Gatekeeper 2 — BlockedIp row created for the test IP", Boolean(blockedRow2));
  } finally {
    // Cleanup always runs — a failed/crashed dry run must never leave
    // the site actually locked down for real visitors. Restores the
    // exact prior settings snapshot rather than hardcoding "off", so
    // an unrelated maintenanceMode the admin had already set isn't
    // silently undone by running this test.
    await prisma.blockedIp.deleteMany({ where: { ipAddress: { in: [ip1, ip2] } } });
    await prisma.breachEvent.deleteMany({ where: { ipAddress: { in: [ip1, ip2] } } });
    await prisma.systemSettings
      .update({
        where: { id: "singleton" },
        data: {
          breachLockdown: priorSettings?.breachLockdown ?? false,
          maintenanceMode: priorSettings?.maintenanceMode ?? false,
          maintenanceMessage: priorSettings?.maintenanceMessage ?? undefined,
          breachActiveEventId: priorSettings?.breachActiveEventId ?? null,
        },
      })
      .catch(() => {
        // No singleton row existed before the run either — nothing to restore.
      });
  }

  const passedCount = checks.filter((c) => c.passed).length;

  return {
    testIp1: ip1,
    testIp2: ip2,
    warnings,
    checks,
    passedCount,
    totalCount: checks.length,
    allPassed: passedCount === checks.length,
  };
}
