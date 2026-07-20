/**
 * FILE: app/api/superAdmin/settings/vault-passphrase/route.js
 * ROLE: Owner only — every admin account defaults to role
 *       "super_admin" (services/adminSession.js), so a plain
 *       requireSuperAdmin() check isn't strict enough here: this
 *       route reveals/replaces the hidden vault's access credential,
 *       so it additionally checks AdminProfile.isOwner and returns a
 *       plain 404 (not 401/403) for any other staff account — same
 *       reasoning as page.jsx's notFound(), so a non-owner probing
 *       this URL directly can't even tell the feature exists.
 *       Not part of VAULT_STANDALONE_API_PATHS — this is the opposite
 *       trust direction from the vault's own login route: setting the
 *       vault passphrase requires the normal admin login the owner
 *       already knows, since scripts/hashVaultPassphrase.js assumed a
 *       developer with terminal access, which the actual site owner
 *       does not have.
 *
 * PURPOSE:
 * GET  -> tells the settings page whether a vault passphrase has ever
 *         been set (never returns the passphrase or its hash).
 * POST -> generates a brand-new vault passphrase (services/vaultAuth.js's
 *         generateVaultPassphrase()), hashes it, and saves it to
 *         Vault.passphraseHash — the exact same column
 *         services/breachResponse.js's auto-rotation writes to, so
 *         either path (owner clicking this button, or a Gatekeeper 1/2
 *         breach) always leaves ONE consistent source of truth. Also
 *         emails the plaintext (services/emailAlert.js's
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
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";
import { rotateVaultPassphrase, getVaultRecoveryUrl } from "@/services/vaultAuth";
import { sendVaultPassphraseRotationEmail } from "@/services/emailAlert";
import { uploadToDrive } from "@/services/googleDrive";

/**
 * GET
 * Reports only whether a vault passphrase currently exists (DB or the
 * original .env.local value) — the settings page uses this to show
 * "No passphrase set yet" vs "A passphrase is currently set" without
 * ever exposing the value itself.
 */
export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to view this page." },
      { status: 401 }
    );
  }

  // Owner-only, same reasoning as page.jsx — a plain 404 here too, so a
  // non-owner admin poking at this URL directly (not just through the
  // UI) still can't tell this feature exists at all.
  const adminProfile = await prisma.adminProfile.findUnique({
    where: { id: session.uid },
    select: { isOwner: true },
  });
  if (!adminProfile?.isOwner) {
    return NextResponse.json({ success: false, data: null, message: "Not found." }, { status: 404 });
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
    console.error("[vaultPassphraseSettings] Failed to check status:", error.message);
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
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  const adminProfile = await prisma.adminProfile.findUnique({
    where: { id: session.uid },
    select: { isOwner: true, fullName: true },
  });
  if (!adminProfile?.isOwner) {
    return NextResponse.json({ success: false, data: null, message: "Not found." }, { status: 404 });
  }

  try {
    const newPassphrase = await rotateVaultPassphrase();

    const reason = `Manually generated by ${adminProfile.fullName} from the admin dashboard`;

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
        `Generated by: ${adminProfile.fullName}\n\n` +
        `Passphrase:\n${newPassphrase}\n\n` +
        `This passphrase gates the disaster-recovery page at [${vaultRecoveryUrl.replace(/^https?:\/\//, "")}](${vaultRecoveryUrl}).\n` +
        `Generating a new one from the dashboard replaces this one immediately.\n` +
        `Keep this file private — do not share it outside the resort owner.\n`;

      const driveResult = await uploadToDrive(
        `vault-passphrase-${generatedAt.replace(/[:.]/g, "-")}.txt`,
        Buffer.from(fileContent, "utf-8"),
        "text/plain"
      );
      driveSaved = true;
      driveViewLink = driveResult.viewLink;
    } catch (driveError) {
      console.error("[vaultPassphraseSettings] Failed to save passphrase to Google Drive:", driveError.message);
    }

    // Audit trail — this is a disaster-recovery credential, always
    // logged with the admin who generated it, distinct from the
    // "vault_passphrase_rotated" auto-rotation event (actor: "vault").
    await logSecurityEvent({
      eventType: "vault_passphrase_set",
      actor: session.uid,
      request,
      details: `${reason}. Email sent: ${emailSent}. Saved to Drive: ${driveSaved}.`,
    });

    return NextResponse.json({
      success: true,
      data: { passphrase: newPassphrase, emailSent, driveSaved, driveViewLink },
      message: "New vault passphrase generated. Copy it now — it will not be shown again.",
    });
  } catch (error) {
    console.error("[vaultPassphraseSettings] Failed to generate passphrase:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't generate a new passphrase. Please try again." },
      { status: 500 }
    );
  }
}
