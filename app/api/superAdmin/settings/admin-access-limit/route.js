/**
 * FILE: app/api/superAdmin/settings/admin-access-limit/route.js
 * ROLE: Super-admin only — protected by proxy.js auth guard
 *
 * PURPOSE:
 * GET -> returns the currently saved limit plus how many admins are
 *        signed in right now, so the settings page can show both.
 * PUT -> saves a new limit (or null for unlimited). This is what
 *        app/api/auth/login/route.js and app/api/auth/access-status
 *        read from on every login attempt afterward.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";
import { getAdminAccessLimitStatus, updateMaxAdminSessions } from "@/services/adminAccessLimit";

// Accepts a positive whole number, or null for "unlimited". An empty
// string from a cleared input is normalized to null before this runs.
const updateLimitSchema = z.object({
  maxAdminSessions: z.number().int().min(1, "Must allow at least 1 admin.").nullable(),
});

export async function GET(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    const { maxAdminSessions, activeSessionCount } = await getAdminAccessLimitStatus();
    return NextResponse.json({
      success: true,
      data: { maxAdminSessions, activeSessionCount },
      message: "Admin access limit fetched.",
    });
  } catch (error) {
    console.error("[AdminAccessLimit] Failed to fetch:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't load this setting. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  const session = requireSuperAdmin(request);
  if (!session) {
    return NextResponse.json(
      { success: false, data: null, message: "You don't have permission to do this." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    // Treat an empty string / undefined as "unlimited" (null) —
    // the field is optional, not a required 0.
    const rawValue = body.maxAdminSessions;
    const normalizedValue =
      rawValue === "" || rawValue === undefined ? null : Number(rawValue);

    const parsed = updateLimitSchema.safeParse({ maxAdminSessions: normalizedValue });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, data: null, message: parsed.error.issues[0]?.message ?? "Enter a valid number." },
        { status: 400 }
      );
    }

    const updated = await updateMaxAdminSessions(parsed.data.maxAdminSessions, session.uid);

    // Audit trail (Rule 6) — this directly controls who can reach the
    // super-admin area, so every save is logged regardless of value.
    await logAuditEvent({
      actor: session.uid,
      action: "updated",
      targetType: "SystemSettings",
      targetId: "singleton",
      targetName: "Admin Access Limit",
      request,
      details:
        parsed.data.maxAdminSessions === null
          ? "Set the admin access limit to unlimited."
          : `Set the admin access limit to ${parsed.data.maxAdminSessions}.`,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "Admin access limit saved successfully.",
    });
  } catch (error) {
    console.error("[AdminAccessLimit] Failed to save:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't save this setting. Please try again." },
      { status: 500 }
    );
  }
}
