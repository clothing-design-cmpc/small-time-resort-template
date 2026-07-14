/**
 * FILE: app/api/superAdmin/settings/booking-rules/[ruleId]/activate/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * POST -> marks this BookingRule as the one resort-wide active rule
 *         set. Exactly one rule set can be active at a time, so this
 *         deactivates every other rule set in the same transaction —
 *         never left as a UI-only assumption.
 */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/services/prisma";
import { requireSuperAdmin } from "@/services/adminSession";
import { logSecurityEvent } from "@/services/securityLog";

export async function POST(request, { params }) {
  const { ruleId } = await params;

  try {
    const rule = await prisma.bookingRule.findUnique({ where: { id: ruleId } });
    if (!rule) {
      return NextResponse.json({ success: false, data: null, message: "Booking rule set not found." }, { status: 404 });
    }

    // Single transaction so there is never a moment with zero or two
    // active rule sets, even under concurrent requests.
    const [, activatedRule] = await prisma.$transaction([
      prisma.bookingRule.updateMany({ where: { isActive: true }, data: { isActive: false } }),
      prisma.bookingRule.update({ where: { id: ruleId }, data: { isActive: true } }),
    ]);

    const session = requireSuperAdmin(request);
    await logSecurityEvent({
      eventType: "admin_action",
      actor: session?.uid ?? null,
      request,
      details: `Activated booking rule set "${rule.name}".`,
    });

    return NextResponse.json({ success: true, data: activatedRule, message: `"${rule.name}" is now the active rule set.` });
  } catch (error) {
    console.error("[BookingRules] Failed to activate:", error);
    return NextResponse.json(
      { success: false, data: null, message: "We couldn't activate this rule set. Please try again." },
      { status: 500 }
    );
  }
}
