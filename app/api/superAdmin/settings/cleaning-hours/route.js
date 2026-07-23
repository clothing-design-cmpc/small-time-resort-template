/**
 * FILE: app/api/superAdmin/settings/cleaning-hours/route.js
 * ROLE: Super-admin only — protected by proxy.js's normal super_admin
 *       session gate.
 *
 * PURPOSE:
 * GET -> returns SystemSettings.cleaningHours (the resort-wide number
 *        of hours a room stays "Checked-Out — Cleaning" after a
 *        guest's checkout before auto-flipping to "Available").
 * PUT -> updates it. Read by services/roomStatus.js on every
 *        room-status computation.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";

export async function GET() {
  try {
    const settings = await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
      select: { cleaningHours: true },
    });
    return NextResponse.json({ success: true, data: settings, message: "Cleaning hours fetched successfully." });
  } catch (error) {
    console.error("[cleaning-hours] Failed to fetch:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load this setting. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  const admin = requireSuperAdmin(request);
  if (!admin) {
    return NextResponse.json({ success: false, data: null, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const cleaningHours = Number(body.cleaningHours);

    if (!Number.isFinite(cleaningHours) || cleaningHours < 0 || cleaningHours > 24) {
      return NextResponse.json(
        { success: false, data: null, message: "Cleaning hours must be a number between 0 and 24." },
        { status: 400 }
      );
    }

    const settings = await prisma.systemSettings.update({
      where: { id: "singleton" },
      data: { cleaningHours },
      select: { cleaningHours: true },
    });

    return NextResponse.json({
      success: true,
      data: settings,
      message: `Cleaning hours updated to ${cleaningHours}.`,
    });
  } catch (error) {
    console.error("[cleaning-hours] Failed to update:", error.message);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save this setting. Please try again." },
      { status: 500 }
    );
  }
}
