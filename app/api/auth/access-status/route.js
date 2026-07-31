/**
 * FILE: app/api/auth/access-status/route.js
 * ROLE: Public — called by app/superAdmin/login/page.jsx on mount, no
 *       session required (nobody is logged in yet at this point)
 *
 * PURPOSE:
 * Lets the login page know, before the admin even types anything,
 * whether SystemSettings.maxAdminSessions is already full — so the
 * email/password inputs can be disabled with a clear message instead
 * of letting the admin fill out the whole form only to be rejected by
 * /api/auth/login afterward.
 *
 * Only returns a boolean — never the actual limit or the current
 * count, since those are operational details that don't need to be
 * exposed on a public, unauthenticated endpoint.
 *
 * DATA FLOW:
 * 1. Login page calls GET /api/auth/access-status on mount
 * 2. getAdminAccessLimitStatus() reads SystemSettings.maxAdminSessions
 *    and counts active (non-expired) AdminSession rows
 * 3. Returns { limitReached } only
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminAccessLimitStatus } from "@/services/adminAccessLimit";

export async function GET() {
  try {
    const { limitReached } = await getAdminAccessLimitStatus();
    return NextResponse.json({
      success: true,
      data: { limitReached },
      message: "Access status fetched.",
    });
  } catch (error) {
    console.error("[auth/access-status] Failed to fetch:", error.message);
    // Fail open on a read error — never let a DB hiccup lock every
    // admin out of even attempting to sign in.
    return NextResponse.json({
      success: true,
      data: { limitReached: false },
      message: "Access status fetched.",
    });
  }
}
