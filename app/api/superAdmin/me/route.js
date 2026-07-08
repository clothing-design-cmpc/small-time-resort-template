/**
 * FILE: app/api/superAdmin/me/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * GET -> returns the currently signed-in admin's fullName + role, so
 *        AdminHeader.jsx can render the user menu (avatar initials,
 *        name, Sign Out) without decoding the HttpOnly session cookie
 *        itself (client-side JS can't read it — that's the point of
 *        HttpOnly).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/services/adminSession";
import { prisma } from "@/services/prisma";

export async function GET(request) {
  // middleware.js already blocks non-admin requests before this route
  // runs, but requireSuperAdmin() is checked directly too so this
  // endpoint is safe even if it's ever called from a context the
  // matcher doesn't cover.
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    const adminProfile = await prisma.adminProfile.findUnique({ where: { id: session.uid } });

    if (!adminProfile) {
      return NextResponse.json({ success: false, data: null, message: "Admin profile not found." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { fullName: adminProfile.fullName, role: adminProfile.role },
      message: "Admin profile fetched successfully.",
    });
  } catch (error) {
    console.error("[AdminMe] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load your profile. Please try again." },
      { status: 500 }
    );
  }
}
