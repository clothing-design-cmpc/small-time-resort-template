/**
 * FILE: app/api/admin/breach/route.js
 * ROLE: Split auth — the bannerOnly branch is super-admin only (verified
 *       via requireSuperAdmin()); everything else (full detail, PATCH)
 *       is vault-session only (requireVaultSession()) and requires NO
 *       super_admin session at all. Excluded from proxy.js's blanket
 *       /api/admin gate (see VAULT_STANDALONE_API_PATHS in proxy.js) so
 *       that carve-out is enforced here in the route instead.
 *
 * PURPOSE:
 * GET   -> returns the most recent unresolved BreachEvent (if any) plus
 *          the current SystemSettings.breachLockdown flag. Used by both
 *          the dashboard's red alert banner (components/superAdmin/
 *          BreachAlertBanner.jsx) and the hidden recovery page.
 * PATCH -> ends the lockdown: marks the active BreachEvent resolved and
 *          flips breachLockdown + maintenanceMode back off. Only ever
 *          called from the hidden recovery page, after the vault user
 *          has imported the pre-breach SQL backup and confirmed the
 *          database looks right again.
 *
 * VAULT SESSION GATE (services/vaultAuth.js):
 * The vault is a standalone login system now — reading full breach
 * detail or ending a lockdown requires ONLY a "vaultSession" cookie,
 * obtained via the vault's own passphrase + OTP login chain at
 * /system-vault-x9f2/login. No super_admin "session" cookie is checked
 * or required on this path anymore. BreachAlertBanner is the one
 * exception: it's rendered inside the normal /superAdmin/* dashboard
 * for every signed-in admin, so it still needs its own
 * requireSuperAdmin() check — it calls GET with ?bannerOnly=true, which
 * returns only the lockdown flag + which gatekeeper tripped — no IP
 * address, no details, no history.
 *
 * DATA FLOW:
 * 1. services/breachResponse.js creates a BreachEvent + flips
 *    SystemSettings.breachLockdown on the instant a gatekeeper trips
 * 2. BreachAlertBanner's GET ?bannerOnly=true lets every signed-in admin
 *    page show the red banner — gated by requireSuperAdmin() only
 * 3. The recovery page's GET (no query param) needs a vault session
 *    only and returns the full activeBreach + recentBreaches detail
 * 4. This route's PATCH is the only place breachLockdown ever gets
 *    turned back off — never automatically, always a deliberate action
 *    taken from the recovery page, only reachable after the vault's own
 *    login chain has been completed
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { requireVaultSession } from "@/services/vaultAuth";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET(request) {
  // BreachAlertBanner only needs "is something wrong + which gatekeeper"
  // to render its red banner for any signed-in admin — checked here,
  // independently of the vault-session branch below, since a banner
  // viewer has never gone through the vault's own login chain.
  const isBannerOnlyRequest = new URL(request.url).searchParams.get("bannerOnly") === "true";

  if (isBannerOnlyRequest) {
    const session = requireSuperAdmin(request);
    if (!session) {
      return NextResponse.json(
        { success: false, data: null, message: "You don't have permission to do this." },
        { status: 401 }
      );
    }

    try {
      const [settings, activeBreach] = await Promise.all([
        prisma.systemSettings.findUnique({
          where: { id: "singleton" },
          select: { breachLockdown: true },
        }),
        prisma.breachEvent.findFirst({
          where: { resolved: false },
          orderBy: { createdAt: "desc" },
          select: { gatekeeper: true, createdAt: true },
        }),
      ]);

      return NextResponse.json({
        success: true,
        data: { breachLockdown: settings?.breachLockdown ?? false, activeBreach },
        message: "Breach status fetched successfully.",
      });
    } catch (error) {
      console.error("[api/admin/breach] Failed to fetch (banner):", error.message);
      return NextResponse.json(
        { success: false, data: null, message: "We couldn't load the breach status. Please try again." },
        { status: 500 }
      );
    }
  }

  // Full detail (IP address, details text, full history) requires ONLY
  // the vault session — no super_admin session cookie is checked here.
  if (!requireVaultSession(request)) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  try {
    const [settings, activeBreach, recentBreaches] = await Promise.all([
      prisma.systemSettings.findUnique({
        where: { id: "singleton" },
        select: { breachLockdown: true, breachActiveEventId: true, maintenanceMessage: true },
      }),
      prisma.breachEvent.findFirst({
        where: { resolved: false },
        orderBy: { createdAt: "desc" },
      }),
      prisma.breachEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        breachLockdown: settings?.breachLockdown ?? false,
        activeBreach,
        recentBreaches,
      },
      message: "Breach status fetched successfully.",
    });
  } catch (error) {
    console.error("[api/admin/breach] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the breach status. Please try again." },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  // Ending a site-wide lockdown is the single most consequential action
  // on this whole page — gated ONLY by the vault session (passphrase +
  // OTP login chain). No super_admin session cookie is required or
  // checked here anymore.
  const vaultSession = requireVaultSession(request);
  if (!vaultSession) {
    return NextResponse.json(
      { success: false, data: null, message: "Vault authentication required." },
      { status: 401 }
    );
  }

  try {
    const activeBreach = await prisma.breachEvent.findFirst({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
    });

    if (activeBreach) {
      await prisma.breachEvent.update({
        where: { id: activeBreach.id },
        data: { resolved: true, resolvedBy: vaultSession.uid, resolvedAt: new Date() },
      });
    }

    await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: { breachLockdown: false, maintenanceMode: false, breachActiveEventId: null },
      create: { id: "singleton", breachLockdown: false, maintenanceMode: false },
    });

    // Ending a site-wide lockdown is a significant, destructive-adjacent
    // action (Rule 34.4 territory) — always logged, actor is the fixed
    // vault identity (VAULT_IDENTITY) since no super-admin account is
    // behind this session.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: vaultSession.uid,
      request,
      details: activeBreach
        ? `Ended breach lockdown and resolved Gatekeeper ${activeBreach.gatekeeper} incident.`
        : "Ended breach lockdown (no active incident row found).",
    });

    return NextResponse.json({
      success: true,
      data: null,
      message: "Lockdown ended. The website is live again.",
    });
  } catch (error) {
    console.error("[api/admin/breach] Failed to end lockdown:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't end the lockdown. Please try again." },
      { status: 500 }
    );
  }
}
