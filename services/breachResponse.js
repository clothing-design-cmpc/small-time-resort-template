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
 * 6. Gatekeeper 1/2 ONLY: auto-rotate the vault passphrase
 *    (services/vaultAuth.js's rotateVaultPassphrase()) and email the
 *    new plaintext passphrase to VAULT_OWNER_EMAIL. Never done for
 *    Gatekeeper 3 — see that step's own comment below for why.
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

  // Step 1 — block the IP immediately. Gatekeepers 1 and 2 trip BEFORE
  // authentication succeeds, so blocking is always safe there. Gatekeeper
  // 3 trips AFTER a successful login with a correct password — the IP
  // that just tripped it may well be the real super-admin travelling or
  // using a new device, and this project's only recovery path requires
  // reaching the hidden recovery page from that same session. Auto-blocking
  // here would risk permanently locking the real admin out of their own
  // recovery flow, so Gatekeeper 3 deliberately skips the IP block and
  // relies on lockdown + the alert email/banner instead — a super-admin
  // can always manually block the IP afterward once they've confirmed it
  // really was an intrusion, not just their own new laptop.
  if (ipAddress && gatekeeper !== 3) {
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

  // Step 6 — rotate the vault passphrase, Gatekeeper 1/2 only. These two
  // trip BEFORE authentication succeeds (brute force, SQL injection) —
  // a genuine attack signal, so the old passphrase is invalidated on the
  // spot and a fresh one is emailed to VAULT_OWNER_EMAIL immediately.
  // Gatekeeper 3 fires AFTER a correct password was already entered and
  // may just be the real super-admin on a new device/location — rotating
  // the vault passphrase there could lock out the actual admin before
  // they've had a chance to see the alert email, so it's skipped, same
  // reasoning as the IP-block skip above.
  let vaultPassphraseRotated = false;
  if (gatekeeper === 1 || gatekeeper === 2) {
    try {
      const newPassphrase = await rotateVaultPassphrase();
      vaultPassphraseRotated = await sendVaultPassphraseRotationEmail({
        newPassphrase,
        reason,
      });
      await logSecurityEvent({
        eventType: "vault_passphrase_rotated",
        actor: "vault",
        details: `Auto-rotated after ${reason}. New passphrase emailed to VAULT_OWNER_EMAIL.`,
      });
    } catch (error) {
      console.error("[breachResponse] Failed to rotate vault passphrase:", error.message);
    }
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
