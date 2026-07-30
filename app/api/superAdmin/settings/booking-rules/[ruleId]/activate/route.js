/**
 * FILE: app/api/superAdmin/settings/booking-rules/[ruleId]/activate/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * POST -> flips this BookingRule's isActive flag to whatever the client
 *         sends (body.isActive). Simple per-row toggle — this rule set
 *         is the only row touched. There is no cascading deactivation
 *         of any other rule set, so multiple rule sets (even ones
 *         allowing the same booking type) can be Active at the same
 *         time. services/bookingRules.js resolves which one actually
 *         governs pricing/availability when more than one is active
 *         for a given type (most recently updated one wins).
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logAuditEvent } from "@/services/auditLog";

export async function POST(request, { params }) {
  const { ruleId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    // Defaults to true so calling this endpoint with no body still
    // behaves like a plain "activate" action.
    const nextIsActive = typeof body.isActive === "boolean" ? body.isActive : true;

    const rule = await prisma.bookingRule.findUnique({ where: { id: ruleId } });
    if (!rule) {
      return NextResponse.json({ success: false, data: null, message: "Booking rule set not found." }, { status: 404 });
    }

    const updatedRule = await prisma.bookingRule.update({
      where: { id: ruleId },
      data: { isActive: nextIsActive },
    });

    const session = requireSuperAdmin(request);
    await logAuditEvent({
      actor: session?.uid ?? null,
      action: "updated",
      targetType: "BookingRule",
      targetId: updatedRule.id,
      targetName: rule.name,
      request,
      details: `${nextIsActive ? "Activated" : "Deactivated"} booking rule set "${rule.name}".`,
    });

    return NextResponse.json({
      success: true,
      data: updatedRule,
      message: `"${rule.name}" is now ${nextIsActive ? "Active" : "Inactive"}.`,
    });
  } catch (error) {
    console.error("[BookingRules] Failed to toggle active state:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't update this rule set. Please try again." },
      { status: 500 }
    );
  }
}
