/**
 * FILE: services/breachResponse.js
 * PURPOSE:
 * Single entry point for the 3-Gatekeeper breach response. Called the
 * instant any gatekeeper trips — never called directly from more than
 * one place per gatekeeper, always through triggerGatekeeperBreach().
 *
 * THE 3 GATEKEEPERS (each already instrumented elsewhere in this app —
 * this file just reacts to them, it doesn't detect anything itself):
 *   Gatekeeper 1 — login brute force: services/rateLimit.js trips on
 *                  the login route (5 failed attempts / 15 min)
 *   Gatekeeper 2 — SQL injection attempt: services/sqlInjectionGuard.js
 *                  flags a request body on login or booking submission
 *   Gatekeeper 3 — anomalous admin login: services/securityLog.js's
 *                  own anomaly detector flags impossible travel or a
 *                  brand-new device on a successful super-admin sign-in
 *
 * WHAT HAPPENS ON A TRIP (in this exact order):
 * 1. Block the offending IP (services/ipBlock.js) — every future
 *    request from this IP gets a plain 403 from proxy.js, for
 *    every route, visitor and super-admin alike.
 * 2. Create a BreachEvent row — the incident record the recovery page
 *    and the super-admin alert banner both read from.
 * 3. Flip SystemSettings.breachLockdown + maintenanceMode on, with the
 *    breach-specific message — every visitor now sees the full-page
 *    takeover screen instead of the working site.
 * 4. Dispatch database-backup.yml on GitHub Actions (Rule 40.1 — this
 *    NEVER runs pg_dump inside the live request, it just presses the
 *    same "Run workflow" button the Backups page already exposes).
 * 5. Email the super-admin via EmailJS (best-effort, never blocks).
 * 6. ALL 3 gatekeepers: auto-rotate the vault passphrase
 *    (services/vaultAuth.js's rotateVaultPassphrase()), email the new
 *    plaintext passphrase to VAULT_OWNER_EMAIL, and additionally save
 *    a plaintext .txt copy of it to Google Drive (services/googleDrive.js)
 *    as a second, durable channel alongside the email.
 *
 *    Per owner's explicit instruction (2026-07), Gatekeeper 3 now gets
 *    the exact same full response as 1 and 2 — including the IP block
 *    and the passphrase rotation — even though it fires AFTER a
 *    correct password. Previously this was deliberately skipped for
 *    Gatekeeper 3 because a genuine super-admin traveling or using a
 *    new device would otherwise get auto-blocked out of their own
 *    recovery page. That risk still exists — if this ever locks out a
 *    real admin, the fix is the same as any other IP block: unban from
 *    the vault's "View Blocked Ips" list, or delete the BlockedIp row
 *    directly.
 *
 * WHY EVERY STEP IS ITS OWN TRY/CATCH:
 * A failure in step 4 (say, GitHub Actions is briefly down) must never
 * stop step 5 (the alert email) or prevent the IP block from having
 * already taken effect. Each step is independent and self-contained —
 * this mirrors Rule 38's "logging never breaks the request" principle,
 * scaled up to "one failed response step never cancels the others."
 *
 * NEVER call this on every request for an already-blocked IP — the
 * calling route must check whether this IP is already in BlockedIp
 * (or whether an unresolved BreachEvent already exists) before calling
 * this, so a repeat attacker doesn't re-trigger a fresh backup + email
 * on every single retry once they're already locked out.
 */
import { prisma } from "@/services/prisma";
import { blockIp } from "@/services/ipBlock";
import { sendBreachAlertEmail, sendVaultPassphraseRotationEmail } from "@/services/emailAlert";
import { triggerWorkflowDispatch } from "@/services/github";
import { rotateVaultPassphrase } from "@/services/vaultAuth";
import { logSecurityEvent } from "@/services/securityLog";
import { uploadToDrive } from "@/services/googleDrive";

const GATEKEEPER_LABELS = {
  1: "Gatekeeper 1 — Login brute force",
  2: "Gatekeeper 2 — SQL injection attempt",
  3: "Gatekeeper 3 — Anomalous admin login",
};

const BREACH_MESSAGE =
  "This website has been breached and is currently under maintenance. Sorry for the inconvenience — please check back shortly.";

/**
 * triggerGatekeeperBreach
 * @param {object} input
 * @param {1|2|3} input.gatekeeper
 * @param {string|null} input.ipAddress
 * @param {string} input.details - human-readable one-liner for the incident record
 */
export async function triggerGatekeeperBreach({ gatekeeper, ipAddress, details }) {
  const reason = `${GATEKEEPER_LABELS[gatekeeper] ?? `Gatekeeper ${gatekeeper}`} tripped: ${details}`;

  // Step 1 — block the IP immediately, for all 3 gatekeepers. Gatekeeper
  // 3 trips AFTER a successful login with a correct password, so this
  // does carry a real risk of auto-blocking the genuine super-admin if
  // they're travelling or on a new device — that trade-off was made
  // explicitly by the owner in favor of the stronger default. If this
  // ever locks out a real admin, unban the IP from the vault's "View
  // Blocked Ips" list (or delete the BlockedIp row directly) — the
  // vault login itself is never gated by this check (see proxy.js).
  if (ipAddress) {
    await blockIp(ipAddress, reason, gatekeeper);
  }

  // Step 2 — create the incident record.
  let breachEvent = null;
  try {
    breachEvent = await prisma.breachEvent.create({
      data: { gatekeeper, ipAddress, details },
    });
  } catch (error) {
    console.error("[breachResponse] Failed to create BreachEvent row:", error.message);
  }

  // Step 3 — flip site-wide lockdown on.
  try {
    await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: {
        breachLockdown: true,
        maintenanceMode: true,
        maintenanceMessage: BREACH_MESSAGE,
        breachActiveEventId: breachEvent?.id ?? null,
      },
      create: {
        id: "singleton",
        breachLockdown: true,
        maintenanceMode: true,
        maintenanceMessage: BREACH_MESSAGE,
        breachActiveEventId: breachEvent?.id ?? null,
      },
    });
  } catch (error) {
    console.error("[breachResponse] Failed to enable breach lockdown:", error.message);
  }

  // Step 4 — trigger an immediate off-cycle backup, same workflow the
  // Backups page's nightly schedule already uses.
  let backupTriggered = false;
  try {
    await triggerWorkflowDispatch("database-backup.yml");
    backupTriggered = true;
  } catch (error) {
    console.error("[breachResponse] Failed to dispatch backup workflow:", error.message);
  }

  // Step 5 — alert the super-admin. Best-effort, never blocks.
  const emailSent = await sendBreachAlertEmail({ gatekeeper, ipAddress, details });

  // Step 6 — rotate the vault passphrase, for all 3 gatekeepers (see the
  // file header comment for why Gatekeeper 3 is no longer excluded).
  // The old passphrase is invalidated on the spot and the fresh one is
  // sent through two independent channels: an EmailJS email to
  // VAULT_OWNER_EMAIL, and a plaintext .txt file uploaded to the same
  // Google Drive folder the offsite backups use — so the owner still
  // has a durable copy even if the email is missed, delayed, or lands
  // in spam.
  let vaultPassphraseRotated = false;
  try {
    const newPassphrase = await rotateVaultPassphrase();
    vaultPassphraseRotated = await sendVaultPassphraseRotationEmail({
      newPassphrase,
      reason,
    });

    // Second channel — best-effort, never blocks. A failure here must
    // never undo the rotation or stop the email above from having
    // already been attempted.
    let driveFileSaved = false;
    try {
      const rotatedAtReadable =
        new Date().toLocaleString("en-US", {
          dateStyle: "long",
          timeStyle: "short",
          timeZone: "Asia/Manila",
        }) + " PHT";
      const txtContents =
        `Villa Azure Resort — System Vault Passphrase Rotation\n\n` +
        `Reason: ${reason}\n` +
        `Rotated At: ${rotatedAtReadable}\n\n` +
        `New Passphrase: ${newPassphrase}\n\n` +
        `This file was generated automatically after a security gatekeeper breach.\n` +
        `Store it securely and delete it once the passphrase has been recorded elsewhere.\n`;
      const fileName = `vault-passphrase-rotation-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
      await uploadToDrive(fileName, Buffer.from(txtContents, "utf-8"), "text/plain");
      driveFileSaved = true;
    } catch (error) {
      console.error("[breachResponse] Failed to save passphrase txt file to Google Drive:", error.message);
    }

    await logSecurityEvent({
      eventType: "vault_passphrase_rotated",
      actor: "vault",
      details: `Auto-rotated after ${reason}. New passphrase emailed to VAULT_OWNER_EMAIL${driveFileSaved ? " and saved to Google Drive" : " (Google Drive save failed)"}.`,
    });
  } catch (error) {
    console.error("[breachResponse] Failed to rotate vault passphrase:", error.message);
  }

  // Record what actually succeeded so the recovery page can show an
  // honest picture instead of assuming every step worked.
  if (breachEvent) {
    try {
      await prisma.breachEvent.update({
        where: { id: breachEvent.id },
        data: { backupTriggered, emailSent, vaultPassphraseRotated },
      });
    } catch (error) {
      console.error("[breachResponse] Failed to update BreachEvent status flags:", error.message);
    }
  }

  return breachEvent;
}
