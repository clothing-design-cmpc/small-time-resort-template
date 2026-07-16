/**
 * FILE: app/api/superAdmin/settings/vault-passphrase/route.js
 * ROLE: Super-admin only — protected by proxy.js auth guard (regular
 *       "session" cookie), NOT part of VAULT_STANDALONE_API_PATHS.
 *       This is the opposite trust direction from the vault's own
 *       login route: setting the vault passphrase requires the normal
 *       admin login the owner already knows, since scripts/
 *       hashVaultPassphrase.js assumed a developer with terminal
 *       access, which the actual site owner does not have.
 *
 * PURPOSE:
 * GET  -> tells the settings page whether a vault passphrase has ever
 *         been set (never returns the passphrase or its hash).
 * POST -> generates a brand-new vault passphrase (services/vaultAuth.js's
 *         generateVaultPassphrase()), hashes it, and saves it to
 *         SystemSettings.vaultPassphraseHash — the exact same column
 *         services/breachResponse.js's auto-rotation writes to, so
 *         either path (owner clicking this button, or a Gatekeeper 1/2
 *         breach) always leaves ONE consistent source of truth.
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
import { generateVaultPassphrase, hashVaultPassphrase } from "@/services/vaultAuth";

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

  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "singleton" },
      select: { vaultPassphraseHash: true },
    });

    const isConfigured = Boolean(settings?.vaultPassphraseHash || process.env.VAULT_PASSPHRASE_HASH);

    return NextResponse.json({
      success: true,
      data: { isConfigured },
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
 * SystemSettings.vaultPassphraseHash — this immediately invalidates
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

  try {
    const newPassphrase = generateVaultPassphrase();
    const newHash = hashVaultPassphrase(newPassphrase);

    await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: { vaultPassphraseHash: newHash },
      create: { id: "singleton", vaultPassphraseHash: newHash },
    });

    // Audit trail — this is a disaster-recovery credential, always
    // logged with the admin who generated it, distinct from the
    // "vault_passphrase_rotated" auto-rotation event (actor: "vault").
    await logSecurityEvent({
      eventType: "vault_passphrase_set",
      actor: session.uid,
      request,
      details: "Super-admin generated a new vault passphrase from the settings page.",
    });

    return NextResponse.json({
      success: true,
      data: { passphrase: newPassphrase },
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
