/**
 * FILE: app/api/superAdmin/settings/booking-rules/[ruleId]/activate/route.js
 * ROLE: Super-admin only — protected by middleware.js auth guard
 *
 * PURPOSE:
 * POST -> marks this BookingRule as active FOR WHICHEVER BOOKING TYPES
 *         IT ALLOWS (Overnight / Day Tour / Night Tour each have their
 *         own independent active slot — see services/bookingRules.js).
 *         Deactivates only the OTHER rule sets that compete for one of
 *         those same types, in the same transaction — a Day-Tour-only
 *         rule set being activated never touches whichever rule set is
 *         currently active for Overnight or Night Tour.
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

    // Which booking types this rule set actually allows — only rule sets
    // competing for one of THESE types get deactivated below.
    const overlappingTypeFields = ["allowOvernightStay", "allowDayTour", "allowNightTour"].filter(
      (field) => rule[field]
    );

    const conflictingActiveRules = overlappingTypeFields.length
      ? await prisma.bookingRule.findMany({
          where: {
            id: { not: ruleId },
            isActive: true,
            OR: overlappingTypeFields.map((field) => ({ [field]: true })),
          },
          select: { id: true },
        })
      : [];

    // Single transaction so there is never a moment with zero active
    // rule sets for a given type, even under concurrent requests.
    const [, activatedRule] = await prisma.$transaction([
      prisma.bookingRule.updateMany({
        where: { id: { in: conflictingActiveRules.map((conflictingRule) => conflictingRule.id) } },
        data: { isActive: false },
      }),
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
