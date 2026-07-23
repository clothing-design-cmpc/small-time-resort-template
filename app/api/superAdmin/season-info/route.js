/**
 * FILE: app/api/superAdmin/season-info/route.js
 * ROLE: Super-admin only — protected by proxy.js's normal super_admin
 *       session gate.
 *
 * PURPOSE:
 * Read-only "what's the season/event right now" lookup for
 * components/superAdmin/AdminHeader.jsx's top-bar display. Separate
 * from /api/superAdmin/settings/season-definitions (the CRUD route
 * Section 5's info panel uses) since the top bar only ever needs the
 * single current answer, not the full editable list.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getOrSeedSeasonDefinitions, getCurrentSeason, getTodaysEvent } from "@/services/seasonInfo";

export async function GET() {
  try {
    const seasonDefinitions = await getOrSeedSeasonDefinitions();
    const currentSeason = getCurrentSeason(seasonDefinitions);
    const todaysEvent = await getTodaysEvent();

    return NextResponse.json({
      success: true,
      data: {
        season: currentSeason ? { label: currentSeason.label, seasonType: currentSeason.seasonType } : null,
        event: todaysEvent,
      },
      message: "Season info fetched successfully.",
    });
  } catch (error) {
    console.error("[season-info] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load season info." },
      { status: 500 }
    );
  }
}
