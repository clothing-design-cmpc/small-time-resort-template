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
 *         been set in the new VaultPassphrase table. If NOTHING is
 *         set yet (no DB row AND no VAULT_PASSPHRASE_HASH env
 *         fallback — source "none"), it now auto-generates one on
 *         the spot using the exact same rotate + email + R2-save +
 *         audit-log flow as POST below, and returns the plaintext in
 *         this one response — same one-time-reveal rule as POST. This
 *         covers first-run / post-wipe bootstrap: hitting this URL
 *         with a valid key is enough by itself, no separate "generate"
 *         click needed, since a totally unset vault has nothing left
 *         to protect by requiring an extra step. If a passphrase
 *         already exists (DB or env), GET stays read-only exactly as
 *         before — it never rotates an already-configured passphrase
 *         out from under the owner just because the page loaded.
 * POST -> generates a brand-new vault passphrase (services/vaultAuth.js's
 *         generateVaultPassphrase()), hashes it, and saves it to
 *         VaultPassphrase.passphraseHash — the exact same column
 *         services/breachResponse.js's auto-rotation writes to (via
 *         services/vaultAuth.js's rotateVaultPassphrase()), so either
 *         path (owner using this page, or a Gatekeeper 1/2 breach)
 *         always leaves ONE consistent source of truth. Also emails
 *         the plaintext (services/emailAlert.js's
 *         sendVaultPassphraseRotationEmail(), same template the
 *         auto-rotation uses) and saves it as a durable copy to
 *         Cloudflare R2 (services/vaultPassphraseBackup.js's
 *         saveVaultPassphraseToR2()) — both
 *         best-effort, so a failed email/R2 save never blocks the
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
import { VAULT_IDENTITY } from "@/services/vaultAuth";
import { generateAndDistributePassphrase } from "@/services/vaultPassphrase";

/**
 * GET
 * Reports whether a vault passphrase currently exists in the new
 * VaultPassphrase table (or the original .env.local value) — the
 * setup page uses this to show "No passphrase set yet" vs "A
 * passphrase is currently set" without ever exposing an EXISTING
 * value. If nothing is set at all (source "none"), auto-generates one
 * right here via generateAndDistributePassphrase() and includes the
 * plaintext in the response — see this file's header comment for why.
 */
export async function GET(request) {
  // Path 2 — a valid VAULT_SETUP_KEY header skips the session+DB check
  // entirely; see this file's own header comment for why.
  const hasValidSetupKey = isValidVaultSetupKey(request.headers.get("x-vault-setup-key"));
  // Hoisted (not block-scoped) so the auto-generate branch below can
  // read the authenticated actor's identity — same reason POST already
  // declares these at function scope.
  let session = null;
  let adminProfile = null;

  if (!hasValidSetupKey) {
    // Path 1 — original behavior, unchanged.
    session = requireSuperAdmin(request);
    if (!session) {
      return NextResponse.json(
        { success: false, data: null, message: "You don't have permission to view this page." },
        { status: 401 }
      );
    }

    // Owner-only, same reasoning as page.jsx — a plain 404 here too, so
    // a non-owner admin poking at this URL directly (not just through
    // the UI) still can't tell this feature exists at all.
    adminProfile = await prisma.adminProfile.findUnique({
      where: { id: session.uid },
      select: { isOwner: true, fullName: true },
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

    // Nothing configured anywhere — auto-provision instead of making the
    // owner take a second "generate" step. Only fires on "none": an
    // existing DB row OR env fallback is left completely untouched, so a
    // routine page load never silently rotates a working passphrase.
    if (source === "none") {
      const actor = hasValidSetupKey ? VAULT_IDENTITY : session.uid;
      const generatedByLabel = hasValidSetupKey
        ? "hidden vault setup key (auto-generated, none existed yet)"
        : `${adminProfile.fullName} (auto-generated, none existed yet)`;
      const reason = "Auto-generated on first check — no vault passphrase existed yet in the database or env";

      const result = await generateAndDistributePassphrase({ actor, reason, request, generatedByLabel });

      return NextResponse.json({
        success: true,
        data: {
          isConfigured: true,
          source: "database",
          autoGenerated: true,
          ...result,
        },
        message: "No vault passphrase existed yet, so a new one was generated automatically. Copy it now — it will not be shown again.",
      });
    }

    return NextResponse.json({
      success: true,
      data: { isConfigured: hasDbPassphrase || hasEnvFallback, source, autoGenerated: false },
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
    const reason = hasValidSetupKey
      ? "Manually generated via the hidden vault setup key (no admin session available)"
      : `Manually generated by ${adminProfile.fullName} from the hidden vault setup page`;
    const actor = hasValidSetupKey ? VAULT_IDENTITY : session.uid;
    const generatedByLabel = hasValidSetupKey ? "hidden vault setup key" : adminProfile.fullName;

    const result = await generateAndDistributePassphrase({ actor, reason, request, generatedByLabel });

    return NextResponse.json({
      success: true,
      data: result,
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