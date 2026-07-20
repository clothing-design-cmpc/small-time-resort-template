/**
 * FILE: app/api/system-vault-setup/route.js
 * ROLE: Owner only — standalone, NOT under /api/superAdmin, same
 *       isolation reasoning as app/system-vault-setup/page.jsx above
 *       it. Accepts EITHER the normal admin "session" cookie +
 *       isOwner, OR an "x-vault-setup-key" header matching
 *       VAULT_SETUP_KEY (services/adminSession.js's
 *       isValidVaultSetupKey()) — see that page's own docblock for
 *       why the key path exists: admin_profiles is truncated by
 *       scripts/runDatabaseWipe.js by design, so the session+isOwner
 *       path alone is unreachable after a real wipe, exactly when
 *       this route is most needed.
 *
 * PURPOSE:
 * GET  -> tells the setup page whether a vault passphrase has ever
 *         been set in the new VaultPassphrase table (never returns
 *         the passphrase or its hash).
 * POST -> generates a brand-new vault passphrase (services/vaultAuth.js's
 *         generateVaultPassphrase()), hashes it, and saves it to
 *         VaultPassphrase.passphraseHash — the exact same column
 *         services/breachResponse.js's auto-rotation writes to (via
 *         services/vaultAuth.js's rotateVaultPassphrase()), so either
 *         path (owner using this page, or a Gatekeeper 1/2 breach)
 *         always leaves ONE consistent source of truth. Also emails
 *         the plaintext (services/emailAlert.js's
 *         sendVaultPassphraseRotationEmail(), same template the
 *         auto-rotation uses) and saves it as a .txt file to Google
 *         Drive (services/googleDrive.js's uploadToDrive()) — both
 *         best-effort, so a failed email/Drive save never blocks the
 *         owner from seeing the passphrase on screen; the response
 *         reports each outcome separately so the UI can be honest
 *         about what actually happened.
 *
 * The plaintext passphrase is returned in this ONE response only — it
 * is never stored anywhere, never logged, and the response is never
 * cached (dynamic = "force-dynamic"). The owner must copy it down
 * immediately; refreshing the page will not show it again.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin, isValidVaultSetupKey } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";
import { rotateVaultPassphrase, getVaultRecoveryUrl, VAULT_IDENTITY } from "@/services/vaultAuth";
import { sendVaultPassphraseRotationEmail } from "@/services/emailAlert";
import { uploadToDrive } from "@/services/googleDrive";

/**
 * GET
 * Reports only whether a vault passphrase currently exists in the new
 * VaultPassphrase table (or the original .env.local value) — the
 * setup page uses this to show "No passphrase set yet" vs "A
 * passphrase is currently set" without ever exposing the value itself.
 */
export async function GET(request) {
  // Path 2 — a valid VAULT_SETUP_KEY header skips the session+DB check
  // entirely; see this file's own header comment for why.
  const hasValidSetupKey = isValidVaultSetupKey(request.headers.get("x-vault-setup-key"));

  if (!hasValidSetupKey) {
    // Path 1 — original behavior, unchanged.
    const session = requireSuperAdmin(request);
    if (!session) {
      return NextResponse.json(
        { success: false, data: null, message: "You don't have permission to view this page." },
        { status: 401 }
      );
    }

    // Owner-only, same reasoning as page.jsx — a plain 404 here too, so
    // a non-owner admin poking at this URL directly (not just through
    // the UI) still can't tell this feature exists at all.
    const adminProfile = await prisma.adminProfile.findUnique({
      where: { id: session.uid },
      select: { isOwner: true },
    });
    if (!adminProfile?.isOwner) {
      return NextResponse.json({ success: false, data: null, message: "Not found." }, { status: 404 });
    }
  }

  try {
    const vaultPassphraseRow = await prisma.vaultPassphrase.findUnique({
      where: { id: "vault_passphrase" },
      select: { passphraseHash: true },
    });

    // Distinguish WHERE the effective passphrase is coming from, instead
    // of collapsing DB-set and env-fallback into one "isConfigured" bool —
    // the two look identical to the owner otherwise, even though only a
    // DB-set passphrase has ever been rotated through this page.
    const hasDbPassphrase = Boolean(vaultPassphraseRow?.passphraseHash);
    const hasEnvFallback = Boolean(process.env.VAULT_PASSPHRASE_HASH);
    const source = hasDbPassphrase ? "database" : hasEnvFallback ? "env_fallback" : "none";

    return NextResponse.json({
      success: true,
      data: { isConfigured: hasDbPassphrase || hasEnvFallback, source },
      message: "Vault passphrase status fetched.",
    });
  } catch (error) {
    console.error("[vaultPassphraseSetup] Failed to check status:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't check the vault passphrase status. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * POST
 * Generates a fresh passphrase, hashes it, and overwrites
 * VaultPassphrase.passphraseHash — this immediately invalidates
 * whatever passphrase used to work, DB value or the original
 * .env.local value alike, same as an auto-rotation would.
 *
 * Always server-generated (never accepts a passphrase typed by the
 * owner) — this keeps the one-time-reveal UX simple and guarantees
 * every passphrase meets the same strength bar as the auto-rotated
 * ones from services/breachResponse.js.
 */
export async function POST(request) {
  // Path 2 — a valid VAULT_SETUP_KEY header skips the session+DB check
  // entirely; see this file's own header comment for why. adminProfile
  // stays null on this path since there is, by definition, no admin
  // session to look one up for — the reason/audit-log text below
  // accounts for that.
  const hasValidSetupKey = isValidVaultSetupKey(request.headers.get("x-vault-setup-key"));
  let session = null;
  let adminProfile = null;

  if (!hasValidSetupKey) {
    // Path 1 — original behavior, unchanged.
    session = requireSuperAdmin(request);
    if (!session) {
      return NextResponse.json(
        { success: false, data: null, message: "You don't have permission to do this." },
        { status: 401 }
      );
    }

    adminProfile = await prisma.adminProfile.findUnique({
      where: { id: session.uid },
      select: { isOwner: true, fullName: true },
    });
    if (!adminProfile?.isOwner) {
      return NextResponse.json({ success: false, data: null, message: "Not found." }, { status: 404 });
    }
  }

  try {
    const newPassphrase = await rotateVaultPassphrase();

    const reason = hasValidSetupKey
      ? "Manually generated via the hidden vault setup key (no admin session available)"
      : `Manually generated by ${adminProfile.fullName} from the hidden vault setup page`;

    // Email the plaintext to VAULT_OWNER_EMAIL — best-effort, reuses the
    // exact same template the auto-rotation path uses (Rule: one
    // template per email type, never duplicated per trigger).
    const emailSent = await sendVaultPassphraseRotationEmail({ newPassphrase, reason });

    // Save a .txt copy to Google Drive as a second, durable place to
    // find it later — also best-effort, independent of the email above.
    let driveSaved = false;
    let driveViewLink = null;
    try {
      const generatedAt = new Date().toISOString();
      const vaultRecoveryUrl = await getVaultRecoveryUrl();
      const fileContent =
        `Villa Azure Resort — Vault Recovery Passphrase\n` +
        `Generated: ${generatedAt}\n` +
        `Generated by: ${hasValidSetupKey ? "hidden vault setup key" : adminProfile.fullName}\n\n` +
        `Passphrase:\n${newPassphrase}\n\n` +
        `This passphrase gates the disaster-recovery page at [${vaultRecoveryUrl.replace(/^https?:\/\//, "")}](${vaultRecoveryUrl}).\n` +
        `Generating a new one from the hidden setup page replaces this one immediately.\n` +
        `Keep this file private — do not share it outside the resort owner.\n`;

      const driveResult = await uploadToDrive(
        `vault-passphrase-${generatedAt.replace(/[:.]/g, "-")}.txt`,
        Buffer.from(fileContent, "utf-8"),
        "text/plain"
      );
      driveSaved = true;
      driveViewLink = driveResult.viewLink;
    } catch (driveError) {
      console.error("[vaultPassphraseSetup] Failed to save passphrase to Google Drive:", driveError.message);
    }

    // Audit trail — this is a disaster-recovery credential, always
    // logged with the admin who generated it, distinct from the
    // "vault_passphrase_rotated" auto-rotation event (actor: "vault").
    await logSecurityEvent({
      eventType: "vault_passphrase_set",
      actor: hasValidSetupKey ? VAULT_IDENTITY : session.uid,
      request,
      details: `${reason}. Email sent: ${emailSent}. Saved to Drive: ${driveSaved}.`,
    });

    return NextResponse.json({
      success: true,
      data: { passphrase: newPassphrase, emailSent, driveSaved, driveViewLink },
      message: "New vault passphrase generated. Copy it now — it will not be shown again.",
    });
  } catch (error) {
    console.error("[vaultPassphraseSetup] Failed to generate passphrase:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't generate a new passphrase. Please try again." },
      { status: 500 }
    );
  }
}
