/**
 * FILE: app/api/superAdmin/settings/season-definitions/route.js
 * ROLE: Super-admin only — protected by proxy.js's normal super_admin
 *       session gate.
 *
 * PURPOSE:
 * GET  -> returns every SeasonDefinition row, seeding the three
 *         default Philippine seasons (services/seasonInfo.js) on
 *         first call if the table is empty.
 * POST -> creates a new custom season definition.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { getOrSeedSeasonDefinitions } from "@/services/seasonInfo";
import { requireSuperAdmin } from "@/services/adminSession";

export async function GET() {
  try {
    const seasonDefinitions = await getOrSeedSeasonDefinitions();
    return NextResponse.json({
      success: true,
      data: seasonDefinitions,
      message: "Season definitions fetched successfully.",
    });
  } catch (error) {
    console.error("[season-definitions] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load season definitions. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const admin = requireSuperAdmin(request);
  if (!admin) {
    return NextResponse.json({ success: false, data: null, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();

    const seasonDefinition = await prisma.seasonDefinition.create({
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
      message: `"${seasonDefinition.label}" added successfully.`,
    });
  } catch (error) {
    console.error("[season-definitions] Failed to create:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save this season. Please try again." },
      { status: 500 }
    );
  }
}
