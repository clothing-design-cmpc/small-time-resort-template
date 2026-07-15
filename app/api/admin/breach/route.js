/**
 * FILE: app/api/admin/breach/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin(), also
 *       covered by middleware.js since this path starts with /api/admin
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
 * DATA FLOW:
 * 1. services/breachResponse.js creates a BreachEvent + flips
 *    SystemSettings.breachLockdown on the instant a gatekeeper trips
 * 2. This route's GET lets both the dashboard banner and the recovery
 *    page read that same state without duplicating the query logic
 * 3. This route's PATCH is the only place breachLockdown ever gets
 *    turned back off — never automatically, always a deliberate
 *    super-admin action taken from the recovery page
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
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
