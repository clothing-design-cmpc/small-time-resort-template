/**
 * FILE: app/api/system-vault-setup/auto-rotate/route.js
 * ROLE: Cron-only — never called by a browser, never linked anywhere.
 *       Authenticated by a shared CRON_SECRET, NOT by the normal admin
 *       "session" cookie (there is no user session in a scheduled job).
 *
 * PURPOSE:
 * Runs on a schedule (see vercel.json's crons entry — daily) and checks
 * whether VaultPassphrase.expiresAt has passed (services/vaultAuth.js's
 * VAULT_PASSPHRASE_EXPIRY_DAYS, 30 days). If it has, generates a fresh
 * passphrase automatically — same generate/hash/email/R2/audit-log
 * flow as the manual "Generate New Passphrase" button, just triggered
 * by the calendar instead of an owner's click. If the 30 days aren't up
 * yet, this is a no-op and returns rotated: false.
 *
 * WHY A SEPARATE ROUTE FROM THE MANUAL ONE:
 * app/api/system-vault-setup/route.js requires either a valid
 * VAULT_SETUP_KEY or requireSuperAdmin() + AdminProfile.isOwner — an
 * actual logged-in person or a developer-held env secret. A cron job
 * has no session cookie and no reason to hold that key, so it needs
 * its own check (CRON_SECRET) instead of reusing either credential.
 *
 * DATA FLOW:
 * 1. Vercel Cron hits this route on schedule with an
 *    "Authorization: Bearer <CRON_SECRET>" header (Vercel's standard
 *    cron auth pattern)
 * 2. Header missing/wrong -> 401, nothing runs
 * 3. autoRotateVaultPassphraseIfExpired() (services/vaultAuth.js) ->
 *    null if not due yet, or the new plaintext passphrase if it just
 *    rotated
 * 4. Not due -> respond { rotated: false }, nothing else happens
 * 5. Rotated -> email the plaintext (services/emailAlert.js), save a
 *    durable copy to Cloudflare R2 (services/vaultPassphraseBackup.js),
 *    log a "vault_passphrase_rotated" SecurityLog row with actor "vault"
 *    (matches the existing breach-triggered auto-rotation's actor, so
 *    both automatic paths are attributed the same way — distinct from
 *    "vault_passphrase_set", which is only for a person clicking the
 *    button), then respond { rotated: true }
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { logSecurityEvent } from "@/services/securityLog";
import { autoRotateVaultPassphraseIfExpired, VAULT_IDENTITY } from "@/services/vaultAuth";
import { sendVaultPassphraseRotationEmail } from "@/services/emailAlert";
import { saveVaultPassphraseToR2 } from "@/services/vaultPassphraseBackup";

export async function GET(request) {
  // Cron auth: Vercel Cron sends this exact header shape. Any other
  // caller (including a browser hitting the URL directly) gets 401 —
  // this route has no other gate, so this check is the only thing
  // standing between it and the public internet.
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, data: null, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const newPassphrase = await autoRotateVaultPassphraseIfExpired();

    // Not due yet — no-op, nothing to email or log.
    if (!newPassphrase) {
      return NextResponse.json({
        success: true,
        data: { rotated: false },
        message: "Vault passphrase not due for rotation yet.",
      });
    }

    const reason = "Automatic 30-day rotation";

    // Email the plaintext to VAULT_OWNER_EMAIL — best-effort, same
    // template every rotation path uses (Rule: one template per email
    // type, never duplicated per trigger).
    const emailSent = await sendVaultPassphraseRotationEmail({ newPassphrase, reason });

    // Save a .txt copy to Cloudflare R2 (private secrets/ key, never
    // the public CDN URL) as a second, durable place to find it later —
    // also best-effort, independent of the email above. Uses the
    // shared helper (Task 4) which retries once on failure before
    // giving up, so a single transient R2 error no longer silently
    // skips the backup the way the old one-shot upload did.
    const { r2Saved, r2SignedUrl } = await saveVaultPassphraseToR2({
      newPassphrase,
      generatedByLabel: "Automatic 30-day rotation",
    });

    // Audit trail — actor is "vault" (VAULT_IDENTITY), same as the
    // breach-triggered auto-rotation, since no admin account performed
    // this action. Distinct eventType from "vault_passphrase_set" so
    // the Security Logs page can tell a scheduled rotation apart from
    // someone clicking the button.
    await logSecurityEvent({
      eventType: "vault_passphrase_rotated",
      actor: VAULT_IDENTITY,
      request,
      details: `${reason}. Email sent: ${emailSent}. Saved to R2: ${r2Saved}.`,
    });

    return NextResponse.json({
      success: true,
      data: { rotated: true, emailSent, r2Saved, r2SignedUrl },
      message: "Vault passphrase auto-rotated after 30 days.",
    });
  } catch (error) {
    console.error("[vaultPassphraseAutoRotate] Failed to auto-rotate passphrase:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Auto-rotation failed. Please check server logs." },
      { status: 500 }
    );
  }
}
