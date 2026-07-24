/**
 * FILE: services/deviceBan.js
 * PURPOSE:
 * Tracks CURRENT ban state for super-admin login attempts, separate
 * from services/securityLog.js (Rule 38), which logs the event trail.
 * This file answers "is this device banned right now" and handles the
 * escalating lockout: 5 fails -> 15 min, 10 fails -> 1 hr, 20 fails ->
 * permanent (cleared only via the vault unban flow).
 *
 * DATA FLOW:
 * 1. Super-admin login route calls isDeviceBanned() before checking
 *    credentials at all.
 * 2. On a failed credential check, the route calls recordFailedAttempt().
 * 3. The vault dashboard reads listActiveBans() for the Unban section.
 * 4. The vault unban route calls unbanDevice() only after its own
 *    step-up TOTP check passes.
 */
import { prisma } from "@/services/prisma";
import { logSecurityEvent } from "@/services/securityLog";
import { parseDeviceInfo } from "@/services/deviceFingerprint";
import { getGeolocationFromIP } from "@/services/geoip";
import crypto from "crypto";

const BAN_THRESHOLDS = [
  { attempts: 20, durationMs: null, reason: "20+ failed attempts — permanent ban" },
  { attempts: 10, durationMs: 60 * 60 * 1000, reason: "10+ failed attempts — 1 hour ban" },
  { attempts: 5, durationMs: 15 * 60 * 1000, reason: "5+ failed attempts — 15 minute ban" },
];

/**
 * generateDeviceFingerprint
 * Same hashing approach as the Rule 38 security log fingerprint — kept
 * local here so this service has no hard dependency on the login
 * route's exact request shape.
 */
export function generateDeviceFingerprint(headers, clientInfo = {}) {
  const components = [
    headers?.get("user-agent")?.toLowerCase().trim(),
    headers?.get("accept-language"),
    headers?.get("accept-encoding"),
    `${clientInfo.screenWidth}x${clientInfo.screenHeight}`,
    String(new Date().getTimezoneOffset()),
    clientInfo.language || "en-US",
  ]
    .filter(Boolean)
    .join("|");

  return crypto.createHash("sha256").update(components).digest("hex");
}

/**
 * isDeviceBanned
 * Checks whether the given fingerprint or IP currently has an active,
 * non-expired ban. Temporary bans are lazily auto-cleared here once
 * their expiry passes — no separate cron needed for that part.
 */
export async function isDeviceBanned(deviceFingerprint, ipAddress) {
  const activeBan = await prisma.bannedDevice.findFirst({
    where: {
      isActive: true,
      OR: [
        deviceFingerprint ? { deviceFingerprint } : undefined,
        ipAddress ? { ipAddress } : undefined,
      ].filter(Boolean),
    },
    orderBy: { bannedAt: "desc" },
  });

  if (!activeBan) return null;

  // Temporary ban has expired on its own — clear it and let the login proceed
  if (activeBan.banExpiresAt && activeBan.banExpiresAt < new Date()) {
    await prisma.bannedDevice.update({
      where: { id: activeBan.id },
      data: { isActive: false, unbannedAt: new Date(), unbannedBy: "auto-expired" },
    });
    return null;
  }

  return activeBan;
}

/**
 * recordFailedAttempt
 * Increments the failed-attempt count for this device fingerprint and
 * escalates into a ban once a threshold is crossed. A device that was
 * previously banned and later cleared starts with a fresh count.
 */
export async function recordFailedAttempt({ deviceFingerprint, ipAddress, request }) {
  const userAgent = request?.headers?.get("user-agent") ?? null;
  const deviceInfo = userAgent ? parseDeviceInfo(userAgent) : {};
  const geoInfo = ipAddress ? getGeolocationFromIP(ipAddress) : {};

  const existing = await prisma.bannedDevice.findFirst({
    where: { deviceFingerprint },
    orderBy: { bannedAt: "desc" },
  });

  // A device that was unbanned gets a clean slate rather than a resumed count
  const wasCleared = existing?.unbannedAt != null;
  const newCount = existing && !wasCleared ? existing.failedAttempts + 1 : 1;

  const matchedThreshold = BAN_THRESHOLDS.find((t) => newCount >= t.attempts);
  const banReason = matchedThreshold?.reason ?? null;
  const banExpiresAt = matchedThreshold?.durationMs
    ? new Date(Date.now() + matchedThreshold.durationMs)
    : null;

  const data = {
    deviceFingerprint,
    ipAddress,
    failedAttempts: newCount,
    banReason,
    banExpiresAt,
    isActive: Boolean(banReason),
    deviceType: deviceInfo.deviceType,
    browserName: deviceInfo.browserName,
    osName: deviceInfo.osName,
    geoCity: geoInfo.geoCity,
    geoCountry: geoInfo.geoCountry,
  };

  const shouldCreateNewRow = !existing || wasCleared;
  const record = shouldCreateNewRow
    ? await prisma.bannedDevice.create({ data })
    : await prisma.bannedDevice.update({ where: { id: existing.id }, data });

  if (banReason) {
    await logSecurityEvent({
      eventType: "admin_login_denied",
      request,
      details: `Device banned: ${banReason}`,
    });
  }

  return record;
}

/**
 * listActiveBans
 * Returns all currently active bans for the vault dashboard's Unban section.
 */
export async function listActiveBans() {
  return prisma.bannedDevice.findMany({
    where: { isActive: true },
    orderBy: { bannedAt: "desc" },
  });
}

/**
 * unbanDevice
 * Clears an active ban. Only ever called from the vault unban route,
 * AFTER its own step-up TOTP check has already passed.
 */
export async function unbanDevice(bannedDeviceId, unbannedBy = "owner") {
  return prisma.bannedDevice.update({
    where: { id: bannedDeviceId },
    data: { isActive: false, unbannedAt: new Date(), unbannedBy },
  });
}
