/**
 * FILE: app/api/superAdmin/settings/maintenance/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET   -> returns the current maintenance mode flag + message.
 * PATCH -> turns maintenance mode on/off. This is what makes every
 *          /visitor page show the full-site banner (Task 4: breach /
 *          planned-downtime response). Logs an admin_action security
 *          event either way, since flipping this affects every guest.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function GET() {
  try {
    const settings = await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
      select: { maintenanceMode: true, maintenanceMessage: true },
    });
    return NextResponse.json({ success: true, data: settings, message: "Maintenance status fetched." });
  } catch (error) {
    console.error("[Maintenance] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load maintenance status. Please try again." },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const maintenanceMode = Boolean(body.maintenanceMode);
    // Trim so an empty string never renders as a bullet with no text on
    // the banner — fall back to a sensible default message instead.
    const maintenanceMessage =
      typeof body.maintenanceMessage === "string" && body.maintenanceMessage.trim().length > 0
        ? body.maintenanceMessage.trim()
        : "We've detected a security issue and taken the site offline as a precaution. We're sorry for the inconvenience — please check back shortly.";

    const settings = await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: { maintenanceMode, maintenanceMessage },
      create: { id: "singleton", maintenanceMode, maintenanceMessage },
      select: { maintenanceMode: true, maintenanceMessage: true },
    });

    // Audit trail — flipping this affects every guest on the site, so it's
    // always logged regardless of which direction it was flipped.
    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: maintenanceMode
        ? "Enabled site-wide maintenance mode."
        : "Disabled site-wide maintenance mode.",
    });

    return NextResponse.json({
      success: true,
      data: settings,
      message: maintenanceMode ? "Maintenance mode is now ON." : "Maintenance mode is now OFF.",
    });
  } catch (error) {
    console.error("[Maintenance] Failed to update:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't update maintenance mode. Please try again." },
      { status: 500 }
    );
  }
}
