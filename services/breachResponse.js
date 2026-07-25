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
 * GATEKEEPER 1 & 2 vs GATEKEEPER 3 — DIFFERENT RESPONSES:
 * GK1 (login brute force) and GK2 (SQL injection attempt) trip BEFORE
 * a valid login — the offending IP is very likely an actual attacker,
 * so the response stays scoped to that one IP: block it, record the
 * incident, alert the owner. Everyone else keeps using the site
 * normally — no site-wide lockdown, no vault passphrase rotation.
 * GK3 (anomalous admin login) trips AFTER a correct password was
 * entered — it could be a stolen session, so the response is the full
 * "assume the worst" treatment: IP block + site-wide lockdown +
 * off-cycle backup + vault passphrase rotation, on top of the IP
 * block and alert email GK1/GK2 already get.
 *
 * WHAT HAPPENS ON A TRIP (in this exact order):
 * 1. Block the offending IP (services/ipBlock.js) — every future
 *    request from this IP gets a plain 403 from proxy.js, for every
 *    route, visitor and super-admin alike. Applies to ALL 3 gatekeepers.
 *    NOTE: proxy.js's actual enforcement of this is currently gated
 *    behind GATEKEEPER_IP_BLOCK_ENABLED="true" in .env.local (off by
 *    default as of July 2026) — the BlockedIp row is always created
 *    here regardless, but it only actually blocks traffic once that
 *    env flag is turned on.
 * 2. Create a BreachEvent row — the incident record the recovery page
 *    and the super-admin alert banner both read from. Applies to ALL
 *    3 gatekeepers.
 * 3. GATEKEEPER 3 ONLY — flip SystemSettings.breachLockdown +
 *    maintenanceMode on, with an explicit breach message — every
 *    visitor now sees the full-page takeover screen instead of the
 *    working site. GK1/GK2 skip this step entirely; the site stays up
 *    for everyone except the blocked IP.
 * 4. GATEKEEPER 3 ONLY — dispatch database-backup.yml on GitHub
 *    Actions (Rule 40.1 — this NEVER runs pg_dump inside the live
 *    request, it just presses the same "Run workflow" button the
 *    Backups page already exposes).
 * 5. Email the super-admin via EmailJS (best-effort, never blocks).
 *    Applies to ALL 3 gatekeepers — the owner should hear about every
 *    trip, not just the full-lockdown ones.
 * 6. GATEKEEPER 3 ONLY — auto-rotate the vault passphrase
 *    (services/vaultAuth.js's rotateVaultPassphrase()), email the new
 *    plaintext passphrase to VAULT_OWNER_EMAIL, AND save a second
 *    plaintext copy to Cloudflare R2 (services/vaultPassphraseBackup.js)
 *    as a durable backup of that same email.
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
import { saveVaultPassphraseToR2 } from "@/services/vaultPassphraseBackup";

const GATEKEEPER_LABELS = {
  1: "Gatekeeper 1 — Login brute force",
  2: "Gatekeeper 2 — SQL injection attempt",
  3: "Gatekeeper 3 — Anomalous admin login",
};

// Shown only on the GK3 full-lockdown takeover screen (owner request —
// explicit rather than the previous vague "routine security check"
// wording). Still never names the specific attack vector — that stays
// on the BreachEvent row, visible only on the vault recovery page's
// "Active Incident" card.
const BREACH_MESSAGE =
  "Website security has been breached. Access is temporarily locked down while our team investigates. Please check back shortly.";

/**
 * triggerGatekeeperBreach
 * @param {object} input
 * @param {1|2|3} input.gatekeeper
 * @param {string|null} input.ipAddress
 * @param {string} input.details - human-readable one-liner for the incident record
 */
export async function triggerGatekeeperBreach({ gatekeeper, ipAddress, details }) {
  const reason = `${GATEKEEPER_LABELS[gatekeeper] ?? `Gatekeeper ${gatekeeper}`} tripped: ${details}`;

  // GK3 gets the full "assume the worst" treatment (site-wide lockdown +
  // backup + vault rotation) because it trips AFTER a correct password —
  // possible stolen session. GK1/GK2 trip BEFORE any valid login, so the
  // offending IP is very likely just an attacker — response stays
  // scoped to that IP instead of taking the whole site down.
  const isFullLockdown = gatekeeper === 3;

  // Step 1 — block the IP immediately, for ALL 3 gatekeepers. Gatekeeper
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

  // Step 3 — GK3 ONLY: flip site-wide lockdown on. GK1/GK2 skip this —
  // the site stays up for everyone except the now-blocked IP.
  if (isFullLockdown) {
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
  }

  // Step 4 — GK3 ONLY: trigger an immediate off-cycle backup, same
  // workflow the Backups page's nightly schedule already uses.
  let backupTriggered = false;
  if (isFullLockdown) {
    try {
      await triggerWorkflowDispatch("database-backup.yml");
      backupTriggered = true;
    } catch (error) {
      console.error("[breachResponse] Failed to dispatch backup workflow:", error.message);
    }
  }

  // Step 5 — alert the super-admin. Best-effort, never blocks.
  const emailSent = await sendBreachAlertEmail({ gatekeeper, ipAddress, details });

  // Step 6 — GK3 ONLY: rotate the vault passphrase. GK1/GK2 skip this —
  // an IP-scoped block doesn't need the whole vault re-keyed. Gatekeeper
  // 3 fires AFTER a correct password was entered and may just be the
  // real super-admin on a new device/location, but the owner would
  // rather rotate on every GK3 trip than risk missing a genuine one.
  // The freshly emailed passphrase (below) is how the real admin
  // recovers either way.
  let vaultPassphraseRotated = false;
  let vaultPassphraseR2Backup = null;
  if (isFullLockdown) {
    try {
      const newPassphrase = await rotateVaultPassphrase();
      vaultPassphraseRotated = await sendVaultPassphraseRotationEmail({
        newPassphrase,
        reason,
      });

      // Step 6b — save the same plaintext passphrase to a .txt file and
      // upload it to Cloudflare R2 (private `secrets/` key, never the
      // public CDN URL — see services/vaultPassphraseBackup.js's header)
      // as a second, durable copy alongside the email — an inbox can be
      // missed, deleted, or temporarily unreachable, and this gives the
      // owner a place to look even if that specific email never
      // arrives. Best-effort: a failed R2 upload must never undo the
      // rotation that already happened, or block the rest of this
      // response.
      //
      // Uses the shared services/vaultPassphraseBackup.js helper (Task 4)
      // instead of a one-off inline upload — that helper retries once
      // before giving up, since a single transient R2 failure (network
      // blip, brief rate limit) was previously enough to silently skip
      // the backup with no second attempt. Same file/format every other
      // rotation path (auto-rotate cron, manual setup) already uses, so
      // all three read as one consistent family in the bucket's
      // secrets/ folder.
      const { r2Saved, r2SignedUrl } = await saveVaultPassphraseToR2({
        newPassphrase,
        generatedByLabel: `Gatekeeper ${gatekeeper} — ${reason}`,
      });
      vaultPassphraseR2Backup = r2SignedUrl;
      if (!r2Saved) {
        console.error("[breachResponse] Failed to save passphrase backup to R2 after retry.");
      }

      await logSecurityEvent({
        eventType: "vault_passphrase_rotated",
        actor: "vault",
        details: `Auto-rotated after ${reason}. New passphrase emailed to VAULT_OWNER_EMAIL${
          vaultPassphraseR2Backup ? " and backed up to Cloudflare R2" : " (R2 backup failed — see server logs)"
        }.`,
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
        data: { backupTriggered, emailSent, vaultPassphraseRotated, vaultPassphraseR2Url: vaultPassphraseR2Backup },
      });
    } catch (error) {
      console.error("[breachResponse] Failed to update BreachEvent status flags:", error.message);
    }
  }

  return breachEvent;
}