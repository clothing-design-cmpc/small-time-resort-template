/**
 * FILE: app/api/admin/breach/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), also
 *       covered by proxy.js since this path starts with /api/admin.
 *       Full detail ALSO gated behind requireVaultSession() — see below.
 *
 * PURPOSE:
 * GET   -> returns the most recent unresolved BreachEvent (if any) plus
 *          the current SystemSettings.breachLockdown flag. Used by both
 *          the dashboard's red alert banner (components/superAdmin/
 *          BreachAlertBanner.jsx) and the hidden recovery page.
 * PATCH -> ends the lockdown: marks the active BreachEvent resolved and
 *          flips breachLockdown + maintenanceMode back off. Only ever
 *          called from the hidden recovery page, after the super-admin
 *          has imported the pre-breach SQL backup and confirmed the
 *          database looks right again.
 *
 * VAULT SESSION GATE (services/vaultAuth.js):
 * A valid super_admin session is no longer enough on its own to read
 * full breach detail or end a lockdown — the caller must ALSO hold a
 * "vaultSession" cookie, obtained only by submitting the separate vault
 * passphrase at /system-vault-x9f2/login. This is checked here too, not
 * just in the recovery page's UI, so a valid super-admin session cookie
 * alone can't be used to call this endpoint directly and skip the vault
 * login screen. BreachAlertBanner still needs to show that SOMETHING is
 * wrong without the admin having entered the vault passphrase yet, so
 * it calls GET with ?bannerOnly=true, which returns only the lockdown
 * flag + which gatekeeper tripped — no IP address, no details, no
 * history — and skips the vault-session requirement.
 *
 * DATA FLOW:
 * 1. services/breachResponse.js creates a BreachEvent + flips
 *    SystemSettings.breachLockdown on the instant a gatekeeper trips
 * 2. BreachAlertBanner's GET ?bannerOnly=true lets every admin page show
 *    the red banner without needing the vault passphrase
 * 3. The recovery page's GET (no query param) needs a vault session and
 *    returns the full activeBreach + recentBreaches detail
 * 4. This route's PATCH is the only place breachLockdown ever gets
 *    turned back off — never automatically, always a deliberate
 *    super-admin action taken from the recovery page, only reachable
 *    after the vault passphrase has already been entered
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { requireVaultSession } from "@/services/vaultAuth";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  // BreachAlertBanner only needs "is something wrong + which gatekeeper"
  // to render its red banner — it must work for every super-admin, not
  // just one who has already entered the vault passphrase, so this one
  // path skips requireVaultSession() below and returns a trimmed shape.
  const isBannerOnlyRequest = new URL(request.url).searchParams.get("bannerOnly") === "true";

  if (isBannerOnlyRequest) {
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

  // Full detail (IP address, details text, full history) requires the
  // separate vault passphrase — never served on a super_admin session alone.
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
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  // Ending a site-wide lockdown is the single most consequential action
  // on this whole page — never allowed without the vault passphrase,
  // even from a completely valid super_admin session.
  if (!requireVaultSession(request)) {
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
        data: { resolved: true, resolvedBy: session.uid, resolvedAt: new Date() },
      });
    }

    await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: { breachLockdown: false, maintenanceMode: false, breachActiveEventId: null },
      create: { id: "singleton", breachLockdown: false, maintenanceMode: false },
    });

    // Ending a site-wide lockdown is a significant, destructive-adjacent
    // action (Rule 34.4 territory) — always logged regardless of which
    // super-admin did it or from which recovery-page session.
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session.uid,
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
