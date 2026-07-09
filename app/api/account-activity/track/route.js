/**
 * FILE: app/api/account-activity/track/route.js
 * ROLE: Super-admin only — verified via requireSuperAdmin()
 *
 * PURPOSE:
 * Receives a page-view beacon from components/superAdmin/AccountActivityBeacon.jsx
 * (mounted only inside the authenticated super-admin layout) and records
 * it against the logged-in account. Rejects the request outright if
 * there's no valid session — this endpoint must never be reachable by
 * an anonymous visitor, per Rule 42's scope guardrail.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { recordAccountActivity } from "@/services/accountActivity";
import { requireSuperAdmin } from "@/services/adminSession";

export async function POST(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to perform this action." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = typeof body.path === "string" && body.path.length > 0 ? body.path.slice(0, 200) : "/superAdmin";

    await recordAccountActivity({ request, accountId: session.uid, action });

    return NextResponse.json({ success: true, data: null, message: "Recorded." });
  } catch (error) {
    console.error("[api/account-activity/track] Failed:", error.message);
    return NextResponse.json({ success: true, data: null, message: "Recorded." });
  }
}
