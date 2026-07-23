/**
 * FILE: app/api/superAdmin/settings/season-definitions/[seasonId]/route.js
 * ROLE: Super-admin only — protected by proxy.js's normal super_admin
 *       session gate.
 *
 * PURPOSE:
 * PUT    -> updates one season definition's label, type, or date range.
 * DELETE -> removes one season definition. No "last one remaining"
 *           guard here (unlike booking rules) — an empty season list
 *           is a valid, if uninformative, state; getCurrentSeason()
 *           and the top bar both already handle "no match" gracefully.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";

export async function PUT(request, { params }) {
  const admin = requireSuperAdmin(request);
  if (!admin) {
    return NextResponse.json({ success: false, data: null, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const { seasonId } = await params;
    const body = await request.json();

    const seasonDefinition = await prisma.seasonDefinition.update({
      where: { id: seasonId },
      data: {
        seasonType: body.seasonType,
        label: body.label,
        startMonth: Number(body.startMonth),
        startDay: Number(body.startDay),
        endMonth: Number(body.endMonth),
        endDay: Number(body.endDay),
      },
    });

    return NextResponse.json({
      success: true,
      data: seasonDefinition,
      message: `"${seasonDefinition.label}" updated successfully.`,
    });
  } catch (error) {
    console.error("[season-definitions] Failed to update:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save this season. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const admin = requireSuperAdmin(request);
  if (!admin) {
    return NextResponse.json({ success: false, data: null, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const { seasonId } = await params;
    await prisma.seasonDefinition.delete({ where: { id: seasonId } });

    return NextResponse.json({ success: true, data: null, message: "Season deleted successfully." });
  } catch (error) {
    console.error("[season-definitions] Failed to delete:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "Failed to delete season." },
      { status: 500 }
    );
  }
}
