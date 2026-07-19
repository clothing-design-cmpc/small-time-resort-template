/**
 * FILE: app/api/admin/post-wipe-lockdown/route.js
 * ROLE: Vault-session only (requireVaultSession) — excluded from
 *       proxy.js's blanket lockdown + /api/admin super_admin gate via
 *       its own exemption in isPostWipeLockdownExemptPath(). Never
 *       checks requireSuperAdmin() — a regular super-admin session is
 *       exactly what postWipeLockdown revokes on sight, so it can
 *       never be the thing that lifts it back.
 *
 * PURPOSE:
 * GET   -> returns the current SystemSettings.postWipeLockdown flag +
 *          when it was triggered. Polled by RecoveryClient.jsx's
 *          "Post-Wipe Lockdown" section.
 * PATCH -> lifts the lockdown: flips postWipeLockdown + maintenanceMode
 *          back off via services/postWipeLockdown.js. Only ever called
 *          from the hidden vault recovery page, after the vault owner
 *          has used the "Fix SQL" section above to re-import a backup
 *          and confirmed the database looks right again — mirrors
 *          app/api/admin/breach/route.js's PATCH exactly, one flag
 *          instead of two (no BreachEvent row involved here).
 *
 * DATA FLOW:
 * 1. scripts/runDatabaseWipe.js flips SystemSettings.postWipeLockdown
 *    on the instant a scheduled wipe's TRUNCATE succeeds
 * 2. proxy.js blocks every other route on sight (see its own file
 *    header) — this route family is the sole exception
 * 3. RecoveryClient.jsx polls GET here to show the current state
 * 4. RecoveryClient.jsx's "Lift Lockdown" button PATCHes here once the
 *    vault owner has verified the restored database
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireVaultSession } from "@/services/vaultAuth";
import { liftPostWipeLockdown } from "@/services/postWipeLockdown";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET(request) {
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "singleton" },
      select: { postWipeLockdown: true, postWipeLockdownAt: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        postWipeLockdown: settings?.postWipeLockdown ?? false,
        postWipeLockdownAt: settings?.postWipeLockdownAt ?? null,
      },
      message: "Post-wipe lockdown status fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/post-wipe-lockdown] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the lockdown status. Please try again." },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  // Bringing the whole site (visitor AND super-admin) back online at
  // once is the single most consequential action reachable from this
  // page — gated ONLY by the full vault session (passphrase + OTP).
  const vaultSession = requireVaultSession(request);
  if (!vaultSession?.otpVerified) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  try {
    await liftPostWipeLockdown();

    await logSecurityEvent({
      eventType: "admin_action",
      actor: vaultSession.uid,
      request,
      details: "Lifted post-wipe lockdown — visitor site and super-admin are both back online.",
    });

    return NextResponse.json({
      success: true,
      data: null,
      message: "Lockdown lifted. The website and super-admin are both back online.",
    });
  } catch (error) {
    console.error("[api/admin/post-wipe-lockdown] Failed to lift lockdown:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't lift the lockdown. Please try again." },
      { status: 500 }
    );
  }
}
