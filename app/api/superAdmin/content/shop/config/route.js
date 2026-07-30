/**
 * FILE: app/api/superAdmin/content/shop/config/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET -> returns the singleton Shop Configuration row (creates it with
 *        nulls on first read if it doesn't exist yet).
 * PUT -> upserts the Shop Configuration row (shop hours, location,
 *        alcohol warning text).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";

const SHOP_CONFIG_ID = "shop_config";

export async function GET() {
  try {
    // The config row is a singleton — read it if it exists, otherwise
    // return sensible blank defaults without writing to the DB yet.
    const config = await prisma.shopConfig.findUnique({ where: { id: SHOP_CONFIG_ID } });

    return NextResponse.json({
      success: true,
      data: config ?? { id: SHOP_CONFIG_ID, shopHours: "", shopLocation: "", alcoholWarningText: "" },
      message: "Shop configuration fetched successfully.",
    });
  } catch (error) {
    console.error("[ShopConfig] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load the shop configuration. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();

    const config = await prisma.shopConfig.upsert({
      where: { id: SHOP_CONFIG_ID },
      update: {
        shopHours: body.shopHours ?? null,
        shopLocation: body.shopLocation ?? null,
        alcoholWarningText: body.alcoholWarningText ?? null,
      },
      create: {
        id: SHOP_CONFIG_ID,
        shopHours: body.shopHours ?? null,
        shopLocation: body.shopLocation ?? null,
        alcoholWarningText: body.alcoholWarningText ?? null,
      },
    });

    // Audit trail (Rule 6) — shop hours/location/warning text changes.
    const session = requireSuperAdmin(request);
    await logAuditEvent({
      actor: session?.uid ?? null,
      action: "updated",
      targetType: "ShopConfig",
      targetId: config.id,
      targetName: "Shop Configuration",
      request,
      details: "Updated shop configuration (hours, location, or alcohol warning text).",
    });

    return NextResponse.json({ success: true, data: config, message: "Shop configuration saved successfully." });
  } catch (error) {
    console.error("[ShopConfig] Failed to save:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save the shop configuration. Please try again." },
      { status: 500 }
    );
  }
}
