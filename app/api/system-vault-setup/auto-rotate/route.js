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
 * passphrase automatically via services/vaultPassphrase.js's
 * generateAndDistributePassphrase() — the SAME shared rotate/email/
 * Telegram/R2/audit-log flow the manual "Generate New Passphrase"
 * button and the setup wizard's Step 6 already use, just triggered by
 * the calendar instead of an owner's click or a breach. Previously
 * this route duplicated that flow inline with its own one-off
 * email+R2+log calls, which had already drifted out of sync with the
 * shared helper (missing the Telegram alert every other rotation path
 * gets) — routing through the one shared function here means every
 * future channel added to a rotation (this Telegram alert included)
 * automatically covers the monthly cron too, instead of needing a
 * fourth place to remember to update. If the 30 days aren't up yet,
 * this is a no-op and returns rotated: false.
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
 * 2. Header missing/wrong -> 401, nothing runs. See the two checks
 *    below for why a missing CRON_SECRET on the server and a wrong
 *    header value are now logged with DIFFERENT messages — a silently
 *    unset env var used to look identical to an actual wrong-secret
 *    attempt in the logs, which made "rotation isn't happening" hard
 *    to diagnose from a scheduled job with no other output.
 * 3. isVaultPassphraseExpired() (services/vaultAuth.js) -> if not due
 *    yet, respond { rotated: false } and stop here
 * 4. Due -> generateAndDistributePassphrase() rotates + emails +
 *    Telegrams + backs up to R2 + writes the audit log in one call,
 *    then respond { rotated: true, ...result }
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isVaultPassphraseExpired, VAULT_IDENTITY } from "@/services/vaultAuth";
import { generateAndDistributePassphrase } from "@/services/vaultPassphrase";

export async function GET(request) {
  // Cron auth: Vercel Cron sends this exact header shape. Any other
  // caller (including a browser hitting the URL directly) gets 401 —
  // this route has no other gate, so this check is the only thing
  // standing between it and the public internet.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  // A missing CRON_SECRET on the server is a DEPLOYMENT misconfiguration,
  // not an attacker — call that out distinctly in the logs so it never
  // gets mistaken for the same "someone guessed wrong" case below. This
  // is the most common reason monthly rotation silently never fires:
  // the env var was never set (or never redeployed after being set),
  // so every real Vercel Cron call 401s here with nothing else in the
  // logs to explain why.
  if (!cronSecret) {
    console.error(
      "[vaultPassphraseAutoRotate] CRON_SECRET is not set on the server — every cron call will 401 until this is configured in .env.local / the deployment's env vars."
    );
    return NextResponse.json({ success: false, data: null, message: "Unauthorized." }, { status: 401 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error("[vaultPassphraseAutoRotate] Rejected a call with a missing/incorrect Authorization header.");
    return NextResponse.json({ success: false, data: null, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const isDue = await isVaultPassphraseExpired();

    // Not due yet — no-op, nothing to email, Telegram, or log.
    if (!isDue) {
      return NextResponse.json({
        success: true,
        data: { rotated: false },
        message: "Vault passphrase not due for rotation yet.",
      });
    }

    const result = await generateAndDistributePassphrase({
      actor: VAULT_IDENTITY,
      reason: "Automatic 30-day rotation",
      request,
      generatedByLabel: "Automatic 30-day rotation",
    });

    return NextResponse.json({
      success: true,
      data: { rotated: true, ...result, passphrase: undefined },
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
