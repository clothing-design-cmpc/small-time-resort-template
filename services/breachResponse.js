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
 *                  the login route (3 failed attempts / 15 min)
 *   Gatekeeper 2 — SQL injection attempt: services/sqlInjectionGuard.js
 *                  flags a request body on login or booking submission
 *   Gatekeeper 3 — anomalous admin login: services/securityLog.js's
 *                  own anomaly detector flags impossible travel or a
 *                  brand-new device on a successful super-admin sign-in
 *
 * WHAT HAPPENS ON A TRIP (in this exact order):
 * 1. Block the offending IP (services/ipBlock.js) — every future
 *    request from this IP gets a plain 403 from proxy.js, for every
 *    route, visitor and super-admin alike. Applies to ALL 3 gatekeepers
 *    (owner request — see that step's own comment for the accepted
 *    trade-off on Gatekeeper 3). NOTE: proxy.js's actual enforcement of
 *    this is currently gated behind GATEKEEPER_IP_BLOCK_ENABLED="true"
 *    in .env.local (off by default as of July 2026) — the BlockedIp row
 *    is always created here regardless, but it only actually blocks
 *    traffic once that env flag is turned on.
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
 *    plaintext passphrase to VAULT_OWNER_EMAIL, AND save a second
 *    plaintext copy as a .txt file to Google Drive (services/
 *    googleDrive.js) as a durable backup of that same email.
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
import { rotateVaultPassphrase, getVaultRecoveryUrl } from "@/services/vaultAuth";
import { logSecurityEvent } from "@/services/securityLog";
import { uploadToDrive } from "@/services/googleDrive";

const GATEKEEPER_LABELS = {
  1: "Gatekeeper 1 — Login brute force",
  2: "Gatekeeper 2 — SQL injection attempt",
  3: "Gatekeeper 3 — Anomalous admin login",
};

// Deliberately generic regardless of WHICH gatekeeper tripped (1, 2, or
// 3) — never names the specific attack vector (e.g. "SQL injection")
// on a page every visitor, including a would-be attacker, can see. A
// gatekeeper-specific reason is still recorded on the BreachEvent row
// itself and shown only to whoever holds the vault session on the
// recovery page (RecoveryClient.jsx's "Active Incident" card).
const BREACH_MESSAGE =
  "We've temporarily paused the site while our team runs a routine security check. This won't take long — please check back shortly, and thank you for your patience.";

/**
 * triggerGatekeeperBreach
 * @param {object} input
 * @param {1|2|3} input.gatekeeper
 * @param {string|null} input.ipAddress
 * @param {string} input.details - human-readable one-liner for the incident record
 */
export async function triggerGatekeeperBreach({ gatekeeper, ipAddress, details }) {
  const reason = `${GATEKEEPER_LABELS[gatekeeper] ?? `Gatekeeper ${gatekeeper}`} tripped: ${details}`;

  // Step 1 — block the IP immediately, for ALL 3 gatekeepers (owner
  // request — overrides the previous Gatekeeper-3 carve-out). Gatekeeper
  // 3 trips AFTER a successful login with a correct password, so this
  // IP could be the real super-admin travelling or using a new device —
  // that risk is accepted here on purpose. The vault recovery page is
  // reachable via its own separate login chain (passphrase + OTP) and is
  // never gated by BlockedIp/proxy.js's IP check the same way /superAdmin
  // is, so a real admin blocked here can still reach recovery and the new
  // /superAdmin/blocked-ips page (via another device/network) to unblock
  // themselves afterward — see that page for why unbanning itself still
  // requires the vault's own step-up code, not just a super-admin session.
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

  // Step 6 — rotate the vault passphrase, for ALL 3 gatekeepers (owner
  // request — overrides the previous Gatekeeper-3 carve-out). Same
  // accepted trade-off as Step 1's IP block above: Gatekeeper 3 fires
  // AFTER a correct password was entered and may just be the real
  // super-admin on a new device/location, but the owner would rather
  // rotate on every trip than risk missing a genuine one. The freshly
  // emailed passphrase (below) is how the real admin recovers either way.
  let vaultPassphraseRotated = false;
  let vaultPassphraseDriveBackup = null;
  try {
    const newPassphrase = await rotateVaultPassphrase();
    vaultPassphraseRotated = await sendVaultPassphraseRotationEmail({
      newPassphrase,
      reason,
    });

    // Step 6b — save the same plaintext passphrase to a .txt file and
    // upload it to Google Drive (Rule 35.7) as a second, durable copy
    // alongside the email — an inbox can be missed, deleted, or
    // temporarily unreachable, and this gives the owner a place to look
    // even if that specific email never arrives. Best-effort: a failed
    // Drive upload must never undo the rotation that already happened,
    // or block the rest of this response.
    //
    // FORMAT: deliberately matches the exact template + filename
    // pattern app/api/system-vault-setup/route.js and
    // app/api/system-vault-setup/auto-rotate/route.js already use for
    // their own Drive backups — previously this file used its own
    // one-off "VAULT PASSPHRASE ROTATION RECORD" layout and a
    // "vault-passphrase-rotated-...-gatekeeperN.txt" filename, so the
    // three passphrase-backup files in Drive didn't visually match.
    // The gatekeeper number and breach reason aren't lost — they're
    // folded into the same "Generated by:" line the other two paths
    // already use for their own trigger label, so all three files now
    // read as one consistent family instead of two formats plus an
    // odd one out.
    try {
      const generatedAt = new Date().toISOString();
      const vaultRecoveryUrl = await getVaultRecoveryUrl();
      const passphraseFileContents =
        `Villa Azure Resort — Vault Recovery Passphrase\n` +
        `Generated: ${generatedAt}\n` +
        `Generated by: Gatekeeper ${gatekeeper} — ${reason}\n\n` +
        `Passphrase:\n${newPassphrase}\n\n` +
        `This passphrase gates the disaster-recovery page at [${vaultRecoveryUrl.replace(/^https?:\/\//, "")}](${vaultRecoveryUrl}).\n` +
        `This was generated automatically after a gatekeeper breach — the previous passphrase no longer works.\n` +
        `Keep this file private — do not share it outside the resort owner.\n`;

      const uploadResult = await uploadToDrive(
        `vault-passphrase-${generatedAt.replace(/[:.]/g, "-")}.txt`,
        Buffer.from(passphraseFileContents, "utf-8"),
        "text/plain"
      );
      vaultPassphraseDriveBackup = uploadResult.viewLink;
    } catch (error) {
      console.error("[breachResponse] Failed to save passphrase backup to Drive:", error.message);
    }

    await logSecurityEvent({
      eventType: "vault_passphrase_rotated",
      actor: "vault",
      details: `Auto-rotated after ${reason}. New passphrase emailed to VAULT_OWNER_EMAIL${
        vaultPassphraseDriveBackup ? " and backed up to Google Drive" : " (Drive backup failed — see server logs)"
      }.`,
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
        data: { backupTriggered, emailSent, vaultPassphraseRotated, vaultPassphraseDriveUrl: vaultPassphraseDriveBackup },
      });
    } catch (error) {
      console.error("[breachResponse] Failed to update BreachEvent status flags:", error.message);
    }
  }

  return breachEvent;
}