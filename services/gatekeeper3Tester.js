/**
 * FILE: services/gatekeeper3Tester.js
 * PURPOSE:
 * Live test for Gatekeeper 3 (anomalous admin login) — the one
 * gatekeeper services/gatekeeperTester.js's dry run cannot cover,
 * because GK3 only fires after a genuinely VALID super-admin login.
 * There is no "fake" way to trip it the way GK1/GK2 use a wrong
 * password or an SQLi payload — this needs a real login to happen
 * twice, with a different simulated device, so the built-in anomaly
 * detector (services/securityLog.js's detectAnomalies()) flags the
 * second one as a new device and fires the real breach response.
 *
 * *** THIS IS NOT A HARMLESS DRY RUN. UNLIKE GK1/GK2, RUNNING THIS: ***
 * - Actually flips SystemSettings.breachLockdown + maintenanceMode on
 *   for the WHOLE SITE — every visitor sees the breach takeover
 *   screen. It stays ON after this function returns; nothing in this
 *   file turns it back off. A super-admin must manually use the
 *   dashboard's "End Lockdown" action afterward (see
 *   app/api/admin/breach/route.js) — same as ending a real incident.
 * - Actually rotates the real vault passphrase and emails the new one
 *   to VAULT_OWNER_EMAIL. Whoever is running this test needs that
 *   fresh email to get back into the vault next time.
 * - Actually dispatches an off-cycle GitHub Actions backup and sends
 *   a real breach alert email.
 * This is the honest trade-off of testing GK3 for real instead of
 * mocking it — see the confirmation modal in
 * VaultGatekeeper3TesterSection.jsx for the warning shown before this
 * ever runs.
 *
 * REQUIRES REAL CREDENTIALS (owner-provided QA super-admin account):
 * GATEKEEPER3_TEST_ADMIN_EMAIL and GATEKEEPER3_TEST_ADMIN_PASSWORD
 * must be set in .env.local, server-side only (never NEXT_PUBLIC_ —
 * Rule 18.5). Never accepted from the browser/request body — a
 * password must never travel from client to server on every test run
 * when an env var can hold it once. Use a DEDICATED QA admin account
 * for this, never the owner's own real login — GK3 firing rotates the
 * vault passphrase and blocks the test IP, which is disruptive enough
 * that it should never touch a real person's daily-use credentials.
 *
 * WHY THE SAME TEST-NET IP FOR BOTH LOGINS:
 * Both logins use the same reserved RFC 5737 IP (via x-forwarded-for)
 * so this can never accidentally block the real admin running the
 * test. The anomaly detector's "new device" check only compares
 * deviceFingerprint (hash of actor + User-Agent — see services/
 * deviceFingerprint.js), not IP, so a different User-Agent string
 * alone is enough to trip it honestly.
 *
 * WHY "IMPOSSIBLE TRAVEL" ISN'T TESTED HERE:
 * That check needs two real, differently-geolocated IPs — MaxMind
 * GeoIP2 has no coordinates for reserved test-net ranges, so it can
 * never fire from a safe fake IP. Faking it would mean using two real
 * IPs, which risks actually blocking one of them. Left as a manual
 * test — see docs/gatekeeper-testing.md.
 */
import { prisma } from "@/services/prisma";

const DEFAULT_TEST_IP = "203.0.113.33"; // Gatekeeper 3 — separate reserved test-net address from GK1/GK2's

const RESERVED_TEST_RANGES = [/^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./, /^169\.254\./];

function isReservedTestIp(ip) {
  return RESERVED_TEST_RANGES.some((pattern) => pattern.test(ip));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * runGatekeeper3Test
 * Logs in twice with the same real QA admin credentials and the same
 * test IP, but a different User-Agent each time, so the second login
 * is flagged as a new device and trips the real GK3 breach response.
 * Returns a flat list of named checks, same shape as
 * runGatekeeperDryRun() in services/gatekeeperTester.js.
 *
 * @param {object} input
 * @param {string} input.baseUrl  - Origin to test against (this deployment's own origin)
 * @param {string} [input.testIp] - IP for both logins, defaults to a reserved test-net address
 */
export async function runGatekeeper3Test({ baseUrl, testIp }) {
  const ip = (testIp || DEFAULT_TEST_IP).trim();

  const warnings = [];
  if (!isReservedTestIp(ip)) {
    warnings.push(`Test IP (${ip}) isn't in a reserved test range — make sure it isn't a real visitor's or admin's IP.`);
  }

  const adminEmail = process.env.GATEKEEPER3_TEST_ADMIN_EMAIL;
  const adminPassword = process.env.GATEKEEPER3_TEST_ADMIN_PASSWORD;

  const checks = [];
  const check = (name, passed, detail = "") => checks.push({ name, passed, detail });

  // Fail fast and clearly if the dedicated QA credentials were never
  // configured — this must never silently fall through and try an
  // empty email/password against Supabase Auth.
  if (!adminEmail || !adminPassword) {
    check(
      "GATEKEEPER3_TEST_ADMIN_EMAIL / GATEKEEPER3_TEST_ADMIN_PASSWORD configured",
      false,
      "Set both in .env.local (server-side only) using a dedicated QA super-admin account before running this test."
    );
    return {
      testIp: ip,
      warnings,
      checks,
      passedCount: 0,
      totalCount: checks.length,
      allPassed: false,
    };
  }

  // --- Login 1: "Device A" ---
  const loginOneResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
      "user-agent": "GatekeeperTester/1.0 (Device A; first login)",
    },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  check("Login 1 (Device A) succeeds with real credentials", loginOneResponse.status === 200);

  // Give the first login's SecurityLog write time to land before the
  // second login queries "most recent prior login" for comparison.
  await sleep(1500);

  // --- Login 2: "Device B" — same IP, different User-Agent ---
  const loginTwoResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
      "user-agent": "GatekeeperTester/1.0 (Device B; simulated new device)",
    },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  // Login 2 must still succeed (correct password) — GK3 fires as a
  // side effect of a successful login, it does not block the login
  // itself. See app/api/auth/login/route.js's own comment on this.
  check("Login 2 (Device B, simulated new device) succeeds with real credentials", loginTwoResponse.status === 200);

  // Give the fire-and-forget breach response a moment to finish writing.
  await sleep(2000);

  const breachRow = await prisma.breachEvent.findFirst({
    where: { ipAddress: ip, gatekeeper: 3 },
    orderBy: { createdAt: "desc" },
  });
  check("BreachEvent row created (gatekeeper: 3)", Boolean(breachRow), breachRow?.details ?? "");

  const blockedRow = await prisma.blockedIp.findUnique({ where: { ipAddress: ip } });
  check("BlockedIp row created for the test IP", Boolean(blockedRow));

  // GK3 is the FULL-LOCKDOWN gatekeeper (services/breachResponse.js) —
  // unlike GK1/GK2, this MUST flip site-wide lockdown on.
  const lockdownSettings = await prisma.systemSettings.findUnique({
    where: { id: "singleton" },
    select: { breachLockdown: true, maintenanceMode: true },
  });
  check(
    "SystemSettings.breachLockdown + maintenanceMode flipped ON (full site lockdown)",
    lockdownSettings?.breachLockdown === true && lockdownSettings?.maintenanceMode === true
  );

  check("Vault passphrase was rotated", breachRow?.vaultPassphraseRotated === true);

  // The real proof: does proxy.js actually reject this IP now, on a
  // completely unrelated route?
  const blockedResponse = await fetch(`${baseUrl}/`, { headers: { "x-forwarded-for": ip } });
  check("Blocked IP now gets 403 on an unrelated route", blockedResponse.status === 403);

  const passedCount = checks.filter((c) => c.passed).length;

  return {
    testIp: ip,
    warnings,
    checks,
    passedCount,
    totalCount: checks.length,
    allPassed: passedCount === checks.length,
  };
}
